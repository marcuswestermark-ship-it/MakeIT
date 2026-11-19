// Hämtar automatiskt data om Grangex och skriver data/data.json.
// Körs av GitHub Actions (se .github/workflows/update.yml). Inga beroenden – kräver Node 20+.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildDailyAnalysis, todaySE } from "./daily-analysis.mjs";

const OUT = new URL("../data/data.json", import.meta.url);
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const TICKER = "GRANGX.ST";
const MAX_NEWS = 400;

const NEWS_FEEDS = [
  { name: "Google Nyheter (sv)", lang: "sv", url: "https://news.google.com/rss/search?q=Grangex&hl=sv&gl=SE&ceid=SE:sv" },
  { name: "Google Nyheter (no)", lang: "no", url: "https://news.google.com/rss/search?q=Grangex%20OR%20Sydvaranger&hl=no&gl=NO&ceid=NO:no" },
  { name: "Google News (en)", lang: "en", url: "https://news.google.com/rss/search?q=Grangex%20OR%20Sydvaranger&hl=en&gl=US&ceid=US:en" },
  { name: "Pressmeddelanden (MFN)", lang: "sv", url: "https://mfn.se/all/a/grangex.rss", press: true },
];

async function get(url, accept = "*/*") {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res;
}

const decode = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

export function parseRss(xml, feed) {
  const items = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return items.map((it) => {
    let link = tag(it, "link");
    if (!link) link = (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    let title = tag(it, "title");
    let source = tag(it, "source") || feed.name;
    // Google News lägger källan sist i titeln: "Rubrik - Källa"
    if (feed.url.includes("news.google") && source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const dateStr = tag(it, "pubDate") || tag(it, "published") || tag(it, "updated") || tag(it, "dc:date");
    const date = dateStr && !isNaN(Date.parse(dateStr)) ? new Date(dateStr).toISOString() : null;
    return { id: link || title, title, link, source, date, lang: feed.lang, press: !!feed.press, feed: feed.name };
  }).filter((n) => n.title && n.link);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Yahoo svarar ibland 429 till molnservrar. Prova två värdar, sedan med cookie + "crumb", med paus mellan försöken.
async function yahooChart() {
  const path = `/v8/finance/chart/${TICKER}?range=5y&interval=1d&includePrePost=false`;
  const hosts = ["https://query2.finance.yahoo.com", "https://query1.finance.yahoo.com"];
  const errs = [];
  for (const h of hosts) {
    try { return await (await get(h + path, "application/json")).json(); } catch (e) { errs.push(`${h.slice(8, 14)}: ${e.message}`); }
    await sleep(2000);
  }
  try {
    const r = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
    const hdr = { "User-Agent": UA, Cookie: cookie, Accept: "*/*" };
    const crumb = await (await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: hdr, signal: AbortSignal.timeout(15000) })).text();
    for (const h of hosts) {
      await sleep(2000);
      const res = await fetch(`${h}${path}&crumb=${encodeURIComponent(crumb)}`, { headers: hdr, signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.json();
      errs.push(`${h.slice(8, 14)}+crumb: ${res.status}`);
    }
  } catch (e) { errs.push(`crumb: ${e.message}`); }
  throw new Error(errs.join("; "));
}

const ISIN = "SE0018014243";

function buildQuote(history, extra = {}) {
  history = history.filter((p) => p[1] != null && isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  if (history.length < 2) throw new Error("för lite kurshistorik");
  const price = extra.price ?? history.at(-1)[1];
  const prev = extra.prevClose ?? history.at(-2)[1];
  return {
    ticker: TICKER, currency: "SEK", source: extra.source, price, prevClose: prev,
    changePct: extra.changePct ?? (prev ? ((price - prev) / prev) * 100 : null),
    high52: Math.max(...history.slice(-252).map((p) => p[1])),
    low52: Math.min(...history.slice(-252).map((p) => p[1])),
    time: extra.time || new Date(history.at(-1)[0]).toISOString(),
    history,
  };
}

// Avanza (öppna, inofficiella endpoints som används av avanza.se)
async function avanzaQuote() {
  const hdr = { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/json" };
  let id = process.env.AVANZA_ID;
  if (!id) {
    const r = await fetch("https://www.avanza.se/_api/search/filtered-search", {
      method: "POST", headers: hdr, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ query: "grangex", searchFilter: { types: [] }, pagination: { from: 0, size: 10 } }),
    });
    if (!r.ok) throw new Error(`sök ${r.status}`);
    const j = await r.json();
    const hit = (j.hits || []).find((h) => /stock/i.test(h.type || "") && /grangex/i.test(h.title || "")) || (j.hits || [])[0];
    id = hit?.orderBookId || hit?.orderbookId || hit?.id;
    if (!id) throw new Error("hittade inte Grangex i sökningen");
  }
  const c = await (await get(`https://www.avanza.se/_api/price-chart/stock/${id}?timePeriod=five_years&resolution=day`, "application/json")).json();
  const history = (c.ohlc || []).map((o) => [o.timestamp, o.close, o.totalVolumeTraded ?? null]);
  let extra = { source: `Avanza (${id})` };
  try {
    const m = await (await get(`https://www.avanza.se/_api/market-guide/stock/${id}`, "application/json")).json();
    const q = m.quote || {};
    if (q.last) extra = { ...extra, price: q.last, changePct: q.changePercent, time: q.timeOfLast ? new Date(q.timeOfLast).toISOString() : undefined };
  } catch {}
  return buildQuote(history, extra);
}

// Nasdaq Nordic
async function nasdaqQuote() {
  const hdr = "application/json";
  const s = await (await get(`https://api.nasdaq.com/api/nordic/search?searchText=${ISIN}`, hdr)).json();
  const flat = JSON.stringify(s);
  const id = (flat.match(/"orderbookId":"([^"]+)"/) || [])[1];
  if (!id) throw new Error("inget orderbookId");
  const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 5 * 365 * 864e5).toISOString().slice(0, 10);
  const c = await (await get(`https://api.nasdaq.com/api/nordic/instruments/${id}/chart?assetClass=SHARES&lang=en&fromDate=${from}&toDate=${to}`, hdr)).json();
  const pts = c?.data?.CP || c?.data?.chartData?.CP || [];
  const history = pts.map((p) => [p.z?.dateTime ? Date.parse(p.z.dateTime) : p.x, +(p.z?.value ?? p.y)]);
  return buildQuote(history, { source: `Nasdaq Nordic (${id})` });
}

async function yahooQuote() {
  const j = await yahooChart();
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error("Inget kursresultat");
  const m = r.meta;
  const closes = r.indicators?.quote?.[0]?.close || [];
  const vols = r.indicators?.quote?.[0]?.volume || [];
  const history = (r.timestamp || [])
    .map((t, i) => [t * 1000, closes[i] != null ? +closes[i].toFixed(4) : null, vols[i] ?? null])
    .filter((p) => p[1] != null);
  const price = m.regularMarketPrice ?? history.at(-1)?.[1];
  const prev = history.length > 1 ? history.at(-2)[1] : m.chartPreviousClose;
  return {
    ticker: TICKER, source: "Yahoo Finance",
    currency: m.currency || "SEK",
    price,
    prevClose: prev,
    changePct: prev ? ((price - prev) / prev) * 100 : null,
    high52: Math.max(...history.slice(-252).map((p) => p[1])),
    low52: Math.min(...history.slice(-252).map((p) => p[1])),
    time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
    history,
  };
}

async function main() {
  let prev = {};
  try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
  const errors = [];
  const out = { updated: new Date().toISOString(), quote: prev.quote || null, news: prev.news || [], analyses: prev.analyses || [], errors };

  const qErr = [];
  for (const [name, fn] of [["Avanza", avanzaQuote], ["Nasdaq", nasdaqQuote], ["Yahoo", yahooQuote]]) {
    try { out.quote = await fn(); console.log(`Kurs från ${name}: ${out.quote.price} (${out.quote.history.length} dagar)`); qErr.length = 0; break; }
    catch (e) { qErr.push(`${name}: ${e.message}`); console.warn(`Kurs ${name} misslyckades: ${e.message}`); }
  }
  if (qErr.length) errors.push(`Aktiekurs: ${qErr.join(" | ")}`);

  const byId = new Map(out.news.map((n) => [n.id, n]));
  for (const feed of NEWS_FEEDS) {
    try {
      const xml = await (await get(feed.url, "application/rss+xml, application/xml, text/xml")).text();
      const items = parseRss(xml, feed);
      for (const n of items) if (!byId.has(n.id)) byId.set(n.id, { ...n, firstSeen: out.updated });
      console.log(`${feed.name}: ${items.length} poster`);
    } catch (e) { errors.push(`${feed.name}: ${e.message}`); }
  }
  // Ta bort dubbletter med samma rubrik (samma artikel via flera flöden)
  const seen = new Set();
  out.news = [...byId.values()]
    .filter((n) => /grangex|sydvaranger|dannemora/i.test(n.title + " " + n.source) || n.press)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .filter((n) => { const k = n.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, MAX_NEWS);

  // Daglig analys – en per dag efter börsens stängning (efter 18:00 svensk tid), eller direkt om FORCE_ANALYSIS=1
  const hourSE = +new Date().toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", hour12: false });
  const due = out.analyses[0]?.date !== todaySE() && (hourSE >= 18 || !out.analyses.length);
  if (due || process.env.FORCE_ANALYSIS === "1") {
    try {
      const a = await buildDailyAnalysis(out);
      if (a) out.analyses = [a, ...out.analyses.filter((x) => x.date !== a.date)].slice(0, 120);
      if (a) console.log(`Daglig analys skapad (${a.ai ? "Claude" : "regelbaserad"})`);
    } catch (e) { errors.push(`Daglig analys: ${e.message}`); }
  }

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Klar: kurs=${out.quote?.price ?? "–"}, nyheter=${out.news.length}, fel=${errors.length}`);
  errors.forEach((e) => console.warn("VARNING", e));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
