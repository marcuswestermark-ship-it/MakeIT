// Hämtar data för alla aktier i data/watchlist.json och skriver data/stocks/<id>.json.
// Körs av GitHub Actions (se .github/workflows/update.yml).
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { avanzaInfo, fetchQuote, fetchNews } from "./lib.mjs";
import { buildDailyAnalysis, buildReport, todaySE } from "./analysis.mjs";

const DATA = new URL("../data/", import.meta.url);
const readJson = async (u, fb) => { try { return JSON.parse(await readFile(u, "utf8")); } catch { return fb; } };
const REPORT_MAX_AGE_DAYS = 30;

async function updateStock(stock) {
  console.log(`== ${stock.name}`);
  const file = new URL(`stocks/${stock.id}.json`, DATA);
  let prev = await readJson(file, null);
  if (!prev && stock.id === "grangex") prev = await readJson(new URL("data.json", DATA), null); // flytta gammal data
  prev ||= {};
  const errors = [];
  const out = {
    id: stock.id, updated: new Date().toISOString(), meta: prev.meta || { name: stock.name },
    quote: prev.quote || null, news: prev.news || [], analyses: prev.analyses || [], report: prev.report || null, errors,
  };

  let info = null;
  if (stock.avanzaId) {
    try { info = await avanzaInfo(stock.avanzaId); console.log(`  Avanza-fält: ${info._keys.join(",")}`); delete info._keys; }
    catch (e) { errors.push(`Bolagsinfo: ${e.message}`); }
  }
  if (info) out.meta = { ...out.meta, ...Object.fromEntries(Object.entries(info).filter(([k, v]) => v != null && k !== "quote")), name: stock.name };
  out.quote = (await fetchQuote({ ...stock, isin: stock.isin || info?.isin }, info, errors)) || out.quote;
  out.news = await fetchNews(stock, out.news, errors);

  const force = process.env.FORCE_REPORT === "1" || process.env.FORCE_REPORT === stock.id;
  const old = !out.report || Date.now() - Date.parse(out.report.created) > REPORT_MAX_AGE_DAYS * 864e5;
  if ((force || old) && out.quote) {
    try { out.report = await buildReport(stock, out); console.log(`  Rapport skapad (${out.report.ai ? "Claude" : "regelbaserad"})`); }
    catch (e) { errors.push(`Rapport: ${e.message}`); }
  }

  const hourSE = +new Date().toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", hour12: false });
  const due = out.analyses[0]?.date !== todaySE() && (hourSE >= 18 || !out.analyses.length);
  if (due || force || process.env.FORCE_ANALYSIS === "1") {
    try {
      const a = await buildDailyAnalysis(stock, out);
      if (a) { out.analyses = [a, ...out.analyses.filter((x) => x.date !== a.date)].slice(0, 120); console.log(`  Daglig analys (${a.ai ? "Claude" : "regelbaserad"})`); }
    } catch (e) { errors.push(`Daglig analys: ${e.message}`); }
  }

  await writeFile(file, JSON.stringify(out) + "\n");
  console.log(`  Klar: kurs=${out.quote?.price ?? "–"}, nyheter=${out.news.length}, fel=${errors.length}`);
  errors.forEach((e) => console.warn("  VARNING", e));
}

async function main() {
  await mkdir(new URL("stocks/", DATA), { recursive: true });
  const list = await readJson(new URL("watchlist.json", DATA), []);
  for (const stock of list) {
    try { await updateStock(stock); } catch (e) { console.error(`${stock.name}: ${e.stack}`); }
  }
  // Rensa filer för borttagna aktier och den gamla filen
  await rm(new URL("data.json", DATA), { force: true });
  const { readdir } = await import("node:fs/promises");
  for (const f of await readdir(new URL("stocks/", DATA))) {
    if (!list.some((s) => `${s.id}.json` === f)) await rm(new URL(`stocks/${f}`, DATA));
  }
}
main();
