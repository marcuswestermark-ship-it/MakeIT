// Rapport (bolagsbeskrivning + prognosantaganden) och daglig analys per aktie.
// Med GitHub-hemligheten ANTHROPIC_API_KEY skriver Claude texterna (rapporten med webbsökning); annars regelbaserat.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("../forecast.js");

const MODEL = "claude-opus-5-5";
const SC = ["bear", "base", "bull"];
export const todaySE = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const fmt = (v, d = 2) => (v == null || !isFinite(v) ? "–" : v.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v) => (v == null || !isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${fmt(v, 1)} %`);

let _client;
async function claude() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) { const { default: Anthropic } = await import("@anthropic-ai/sdk"); _client = new Anthropic(); }
  return _client;
}
const textOf = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();

// Prognosantaganden för aktien: rapportens om de finns, annars standard.
export function assumptionsFor(stock, data) {
  if (stock.id === "grangex") return F.defaultAssumptions("grangex");
  if (data.report?.assumptions) return data.report.assumptions;
  return F.defaultAssumptions(stock.id, F.stats(data.quote?.history)?.volatility);
}

const ASSUMPTION_SCHEMA = {
  type: "object", additionalProperties: false, required: SC,
  properties: Object.fromEntries(SC.map((k) => [k, {
    type: "object", additionalProperties: false, required: ["early", "late", "story"],
    properties: {
      early: { type: "number", description: "Antagen genomsnittlig årlig kursutveckling i procent, år 1–5" },
      late: { type: "number", description: "Antagen genomsnittlig årlig kursutveckling i procent, år 6–20" },
      story: { type: "string", description: "1–2 meningar på svenska om vad som händer i scenariot" },
    },
  }])),
};

// ---------- Rapport ----------
async function aiReport(stock, data) {
  const client = await claude();
  if (!client) return null;
  const facts = {
    bolag: stock.name, ticker: data.meta?.ticker, isin: data.meta?.isin, marknad: data.meta?.marketPlace, sektor: data.meta?.sector,
    beskrivning_avanza: data.meta?.description, nyckeltal_avanza: data.meta?.keyIndicators,
    kurs: data.quote?.price, valuta: data.quote?.currency, nyckeltal_kurs: F.stats(data.quote?.history),
    senaste_nyheter: (data.news || []).slice(0, 15).map((n) => `${n.date?.slice(0, 10)} ${n.title} (${n.source})`),
  };
  const messages = [{ role: "user", content: `Skriv en aktierapport om ${stock.name}. Underlag från automatisk datainsamling:\n${JSON.stringify(facts)}` }];
  const system =
    "Du är en noggrann aktieanalytiker som skriver på svenska för en privatperson. Använd webbsökning för att ta reda på aktuell fakta om bolaget " +
    "(verksamhet, affärsmodell, ägare och ledning, senaste rapporter och siffror, skuldsättning och finansiering, viktiga projekt, risker, kommande händelser). " +
    "Skriv en rapport på 400–700 ord med dessa rubriker på egna rader (utan markdown-tecken): Om bolaget, Senaste utvecklingen, Ekonomi och värdering, Möjligheter, Risker, Att bevaka framåt. " +
    "Ange årtal/datum för siffror. Var ärlig om osäkerhet. Ge inga köp- eller säljråd.";
  let report = "";
  for (let i = 0; i < 6; i++) {
    const r = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000, system, messages,
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    if (r.stop_reason === "refusal") return null;
    report += textOf(r);
    if (r.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: r.content });
  }
  if (!report) return null;

  const a = await client.beta.messages.create({
    model: MODEL, max_tokens: 4000, output_config: { effort: "medium", format: { type: "json_schema", schema: ASSUMPTION_SCHEMA } },
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    system: "Du sätter rimliga bear/base/bull-antaganden för en aktieprognos. early = genomsnittlig årlig kursutveckling i % år 1–5, late = år 6–20. " +
      "Bear ska spegla ett realistiskt dåligt utfall, bull ett realistiskt bra, base det mest sannolika. Ta hänsyn till bolagets risk och fas (t.ex. projektbolag vs mogen utdelare) och historisk volatilitet.",
    messages: [{ role: "user", content: `Rapport:\n${report}\n\nNyckeltal: ${JSON.stringify(facts.nyckeltal_kurs)}` }],
  });
  let assumptions = null;
  if (a.stop_reason !== "refusal") { try { assumptions = JSON.parse(textOf(a)); } catch {} }
  return { text: report, assumptions, ai: true };
}

function ruleReport(stock, data) {
  const m = data.meta || {}, s = F.stats(data.quote?.history) || {}, ki = m.keyIndicators || {};
  const lines = [];
  lines.push("Om bolaget");
  lines.push(m.description || `${stock.name}${m.marketPlace ? `, noterat på ${m.marketPlace}` : ""}${m.sector ? `, sektor: ${m.sector}` : ""}.`);
  lines.push("", "Kursutveckling");
  lines.push(`Kurs ${fmt(data.quote?.price, 2)} ${data.quote?.currency || ""}. 1 månad ${pct(s.ret1m)}, 3 månader ${pct(s.ret3m)}, 1 år ${pct(s.ret1y)}. Årlig volatilitet ${fmt(s.volatility, 0)} %. ${pct(s.fromHigh52)} från 52-veckorshögsta.`);
  const named = { priceEarningsRatio: "P/E", priceSalesRatio: "P/S", directYield: "Direktavkastning %", returnOnEquity: "Avkastning på eget kapital", marketCapital: "Börsvärde", numberOfOwners: "Ägare hos Avanza", beta: "Beta" };
  const kl = Object.entries(named).filter(([k]) => ki[k] != null).map(([k, l]) => `${l}: ${fmt(ki[k], k === "marketCapital" || k === "numberOfOwners" ? 0 : 2)}`);
  if (kl.length) lines.push("", "Nyckeltal", kl.join(" · "));
  const news = (data.news || []).slice(0, 8);
  if (news.length) lines.push("", "Senaste nyheterna", ...news.map((n) => `• ${n.date?.slice(0, 10) || ""} ${n.title} (${n.source})`));
  lines.push("", "Rapporten är automatiskt sammanställd. Lägg in en Anthropic API-nyckel i GitHub för en fullständig rapport med webbsökning.");
  return { text: lines.join("\n"), assumptions: null, ai: false };
}

export async function buildReport(stock, data) {
  let r = null;
  try { r = await aiReport(stock, data); } catch (e) { console.warn("  AI-rapport misslyckades:", e.message); }
  if (!r) r = ruleReport(stock, data);
  return { ...r, created: new Date().toISOString() };
}

// ---------- Daglig analys ----------
function ruleAnalysis(stock, s, q, value, newsWeek) {
  const cur = q.currency || "SEK";
  const parts = [];
  parts.push(`${stock.name} stängde på ${fmt(q.price, 2)} ${cur} (${pct(q.changePct)} senaste dagen)` +
    (stock.shares ? ` och dina ${fmt(stock.shares, 0)} aktier är värda ${fmt(value, 0)} ${cur}.` : "."));
  parts.push(`Utveckling: 1 vecka ${pct(s.ret1w)}, 1 månad ${pct(s.ret1m)}, 3 månader ${pct(s.ret3m)}, 1 år ${pct(s.ret1y)}.`);
  if (s.ma50 && s.ma200) {
    const t = s.last > s.ma50 && s.ma50 > s.ma200 ? "positiv – kursen ligger över både 50- och 200-dagars medelvärde"
      : s.last < s.ma50 && s.ma50 < s.ma200 ? "negativ – kursen ligger under både 50- och 200-dagars medelvärde"
      : "blandad – kursen pendlar runt sina glidande medelvärden";
    parts.push(`Teknisk trend: ${t} (MA50 ${fmt(s.ma50, 2)}, MA200 ${fmt(s.ma200, 2)}).`);
  }
  parts.push(`Årlig volatilitet ${fmt(s.volatility, 0)} % (${s.volatility > 60 ? "mycket hög" : s.volatility > 35 ? "hög" : "måttlig"}). Kursen ligger ${pct(s.fromHigh52)} från 52-veckorshögsta.`);
  parts.push(newsWeek.length ? `${newsWeek.length} nyheter senaste veckan, bl.a. ”${newsWeek[0].title}”.` : "Inga nya nyheter senaste veckan.");
  if (stock.id === "grangex") parts.push("Det viktigaste för aktien framåt är finansieringen och investeringsbeslutet (FID) för Sydvaranger.");
  return parts.join(" ");
}

async function aiAnalysis(ctx) {
  const client = await claude();
  if (!client) return null;
  const r = await client.beta.messages.create({
    model: MODEL, max_tokens: 16000, output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    system:
      "Du är en saklig aktieanalytiker som skriver en kort daglig uppdatering på svenska till en privatperson. Använd endast underlaget. " +
      "Skriv 150–250 ord i löpande text utan rubriker: vad som hänt (kurs och nyheter), vad det betyder för bear-, base- och bull-scenariot, och vad man bör bevaka framåt. " +
      "Var ärlig om osäkerheten. Ge inga köp- eller säljråd.",
    messages: [{ role: "user", content: JSON.stringify(ctx) }],
  });
  return r.stop_reason === "refusal" ? null : textOf(r) || null;
}

export async function buildDailyAnalysis(stock, data) {
  const q = data.quote;
  if (!q?.price || !q.history?.length) return null;
  const s = F.stats(q.history);
  const shares = stock.shares || 0;
  const value = q.price * shares;
  const assumptions = assumptionsFor(stock, data);
  const perShare = F.compute({ price: q.price, shares: 1, assumptions });
  const weekAgo = Date.now() - 7 * 864e5;
  const newsWeek = (data.news || []).filter((n) => n.date && Date.parse(n.date) >= weekAgo);
  const ctx = {
    bolag: stock.name, datum: todaySE(), antal_aktier: shares || "okänt", kurs: q.price, valuta: q.currency, dagsforandring_pct: q.changePct,
    innehavsvarde: shares ? Math.round(value) : null, nyckeltal: s, scenarioantaganden: assumptions,
    prognos_kurs_per_aktie: Object.fromEntries(SC.map((k) => [k, perShare[k].map((r) => ({ ar: r.years, kurs: +r.price.toFixed(2) }))])),
    rapport_utdrag: data.report?.text?.slice(0, 3000),
    nyheter_senaste_veckan: newsWeek.slice(0, 20).map((n) => ({ datum: n.date?.slice(0, 10), rubrik: n.title, kalla: n.source })),
  };
  let text = null;
  try { text = await aiAnalysis(ctx); } catch (e) { console.warn("  AI-analys misslyckades:", e.message); }
  const ai = !!text;
  if (!text) text = ruleAnalysis(stock, s, q, value, newsWeek);
  return {
    date: todaySE(), created: new Date().toISOString(), price: q.price, shares, value, stats: s,
    perShare: Object.fromEntries(SC.map((k) => [k, perShare[k].map((r) => +r.price.toFixed(4))])),
    newsCount7d: newsWeek.length, text, ai,
  };
}
