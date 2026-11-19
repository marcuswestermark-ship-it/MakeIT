// Hämtar automatiskt data om Grangex och skriver data/data.json.
// Körs av GitHub Actions (se .github/workflows/update.yml). Inga beroenden – kräver Node 20+.
import { readFile, writeFile, mkdir } from "node:fs/promises";

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

async function fetchQuote() {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${TICKER}?range=5y&interval=1d&includePrePost=false`;
  const j = await (await get(url, "application/json")).json();
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
    ticker: TICKER,
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
  const out = { updated: new Date().toISOString(), quote: prev.quote || null, news: prev.news || [], errors };

  try { out.quote = await fetchQuote(); }
  catch (e) { errors.push(`Aktiekurs: ${e.message}`); }

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

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Klar: kurs=${out.quote?.price ?? "–"}, nyheter=${out.news.length}, fel=${errors.length}`);
  errors.forEach((e) => console.warn("VARNING", e));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
