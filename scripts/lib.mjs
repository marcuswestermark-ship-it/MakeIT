// Gemensamma datakällor: Avanza, Nasdaq Nordic, Yahoo (kurs) och RSS-flöden (nyheter).
export const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function get(url, accept = "*/*", init = {}) {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: accept, ...(init.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res;
}
const getJson = async (url, init) => (await get(url, "application/json", init)).json();

export const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// ---------- Nyheter ----------
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
  return [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map((m) => {
    const it = m[0];
    let link = tag(it, "link") || (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    let title = tag(it, "title");
    const source = tag(it, "source") || feed.name;
    if (feed.url.includes("news.google") && source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const ds = tag(it, "pubDate") || tag(it, "published") || tag(it, "updated") || tag(it, "dc:date");
    const date = ds && !isNaN(Date.parse(ds)) ? new Date(ds).toISOString() : null;
    return { id: link || title, title, link, source, date, lang: feed.lang, press: !!feed.press, feed: feed.name };
  }).filter((n) => n.title && n.link);
}

const gnews = (q, hl, gl, lang, name) => ({
  name, lang, url: `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split("-")[0]}`,
});

export function newsFeeds(stock) {
  const q = stock.newsQuery || `"${stock.name}"`;
  const feeds = [
    gnews(q, "sv", "SE", "sv", "Google Nyheter (sv)"),
    gnews(q, "en-US", "US", "en", "Google News (en)"),
  ];
  if (stock.newsNo) feeds.push(gnews(stock.newsNo, "no", "NO", "no", "Google Nyheter (no)"));
  if (stock.mfn) feeds.push({ name: "Pressmeddelanden (MFN)", lang: "sv", press: true, url: `https://mfn.se/all/a/${stock.mfn}.rss` });
  return feeds;
}

export async function fetchNews(stock, previous = [], errors = []) {
  const byId = new Map(previous.map((n) => [n.id, n]));
  const now = new Date().toISOString();
  for (const feed of newsFeeds(stock)) {
    try {
      const items = parseRss(await (await get(feed.url, "application/rss+xml, application/xml, text/xml")).text(), feed);
      for (const n of items) if (!byId.has(n.id)) byId.set(n.id, { ...n, firstSeen: now });
      console.log(`  ${feed.name}: ${items.length}`);
    } catch (e) { errors.push(`${feed.name}: ${e.message}`); }
  }
  const kw = new RegExp((stock.keywords || [stock.name.split(/\s+/)[0]]).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  const seen = new Set();
  return [...byId.values()]
    .filter((n) => n.press || kw.test(n.title + " " + n.source))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .filter((n) => { const k = n.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 400);
}

// ---------- Kurs ----------
export function buildQuote(history, extra = {}) {
  history = history.filter((p) => p[1] != null && isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  if (history.length < 2) throw new Error("för lite kurshistorik");
  const price = extra.price ?? history.at(-1)[1];
  const prev = extra.prevClose ?? history.at(-2)[1];
  return {
    source: extra.source, currency: extra.currency || "SEK", price, prevClose: prev,
    changePct: extra.changePct ?? (prev ? ((price - prev) / prev) * 100 : null),
    high52: Math.max(...history.slice(-252).map((p) => p[1])),
    low52: Math.min(...history.slice(-252).map((p) => p[1])),
    time: extra.time || new Date(history.at(-1)[0]).toISOString(),
    history,
  };
}

const AV_HDR = { "Content-Type": "application/json" };

// Söker aktier på Avanza. Returnerar [{ avanzaId, name, ticker, type }]
export async function avanzaSearch(query) {
  const res = await get("https://www.avanza.se/_api/search/filtered-search", "application/json", {
    method: "POST", headers: AV_HDR,
    body: JSON.stringify({ query, searchFilter: { types: [] }, pagination: { from: 0, size: 20 } }),
  });
  const j = await res.json();
  return (j.hits || []).map((h) => ({
    avanzaId: String(h.orderBookId ?? h.orderbookId ?? h.id ?? ""),
    name: h.title || h.name || "",
    ticker: h.tickerSymbol || "",
    type: h.type || h.instrumentType || "",
    raw: h,
  })).filter((h) => h.avanzaId);
}

export async function avanzaInfo(id) {
  const m = await getJson(`https://www.avanza.se/_api/market-guide/stock/${id}`);
  const listing = m.listing || {};
  const ki = m.keyIndicators || {};
  const flat = {};
  for (const [k, v] of Object.entries(ki)) {
    if (typeof v === "number") flat[k] = v;
    else if (v && typeof v === "object" && typeof v.value === "number") flat[k] = v.value;
  }
  let description = m.company?.description || m.description || null;
  let sector = m.company?.sector || (m.sectors || []).map((s) => s.sectorName || s.name).filter(Boolean).join(", ") || null;
  if (!description) {
    try {
      const d = await getJson(`https://www.avanza.se/_api/market-guide/stock/${id}/details`);
      description = d.company?.description || d.description || null;
      sector = sector || d.company?.sector || null;
      if (d.keyIndicators) for (const [k, v] of Object.entries(d.keyIndicators)) if (typeof v === "number" && flat[k] == null) flat[k] = v;
    } catch {}
  }
  return {
    name: m.name, isin: m.isin, ticker: listing.tickerSymbol, currency: listing.currency || m.quote?.currency,
    marketPlace: listing.marketPlaceName, country: listing.countryCode, sector, description,
    keyIndicators: flat, quote: m.quote || {},
    _keys: Object.keys(m),
  };
}

export async function avanzaQuote(id, info) {
  const c = await getJson(`https://www.avanza.se/_api/price-chart/stock/${id}?timePeriod=five_years&resolution=day`);
  const history = (c.ohlc || []).map((o) => [o.timestamp, o.close, o.totalVolumeTraded ?? null]);
  const q = info?.quote || {};
  return buildQuote(history, {
    source: `Avanza (${id})`, currency: info?.currency,
    ...(q.last ? { price: q.last, changePct: q.changePercent, time: q.timeOfLast ? new Date(q.timeOfLast).toISOString() : undefined } : {}),
  });
}

export async function nasdaqQuote(isin) {
  if (!isin) throw new Error("ISIN saknas");
  const s = await getJson(`https://api.nasdaq.com/api/nordic/search?searchText=${isin}`);
  const id = (JSON.stringify(s).match(/"orderbookId":"([^"]+)"/) || [])[1];
  if (!id) throw new Error("inget orderbookId");
  const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 5 * 365 * 864e5).toISOString().slice(0, 10);
  const c = await getJson(`https://api.nasdaq.com/api/nordic/instruments/${id}/chart?assetClass=SHARES&lang=en&fromDate=${from}&toDate=${to}`);
  const pts = c?.data?.CP || c?.data?.chartData?.CP || [];
  return buildQuote(pts.map((p) => [p.z?.dateTime ? Date.parse(p.z.dateTime) : p.x, +(p.z?.value ?? p.y)]), { source: `Nasdaq Nordic (${id})` });
}

export async function yahooQuote(symbol) {
  if (!symbol) throw new Error("Yahoo-symbol saknas");
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
  let j, err;
  for (const h of ["https://query2.finance.yahoo.com", "https://query1.finance.yahoo.com"]) {
    try { j = await getJson(h + path); break; } catch (e) { err = e; await sleep(1500); }
  }
  if (!j) throw err;
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error("inget resultat");
  const closes = r.indicators?.quote?.[0]?.close || [], vols = r.indicators?.quote?.[0]?.volume || [];
  const history = (r.timestamp || []).map((t, i) => [t * 1000, closes[i] != null ? +closes[i].toFixed(4) : null, vols[i] ?? null]);
  return buildQuote(history, { source: "Yahoo Finance", currency: r.meta?.currency, price: r.meta?.regularMarketPrice });
}

// Hämtar kurs med reservkällor i tur och ordning.
export async function fetchQuote(stock, info, errors) {
  const tries = [];
  if (stock.avanzaId) tries.push(["Avanza", () => avanzaQuote(stock.avanzaId, info)]);
  if (stock.isin?.startsWith("SE") || stock.isin?.match(/^(FI|DK|NO|IS)/)) tries.push(["Nasdaq", () => nasdaqQuote(stock.isin)]);
  if (stock.yahoo) tries.push(["Yahoo", () => yahooQuote(stock.yahoo)]);
  const errs = [];
  for (const [name, fn] of tries) {
    try { const q = await fn(); console.log(`  Kurs från ${name}: ${q.price} (${q.history.length} dagar)`); return q; }
    catch (e) { errs.push(`${name}: ${e.message}`); }
  }
  errors.push(`Aktiekurs: ${errs.join(" | ") || "ingen källa"}`);
  return null;
}
