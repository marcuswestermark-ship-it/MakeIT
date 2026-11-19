// Daglig analys av Grangex-innehavet. Körs en gång per dag (svensk tid) av fetch-data.mjs.
// Om GitHub-hemligheten ANTHROPIC_API_KEY finns skriver Claude analystexten, annars används en regelbaserad text.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("../forecast.js");

export const SHARES = Number(process.env.GRANGEX_SHARES || 6850);
const MODEL = "claude-opus-5-5";

export const todaySE = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

const fmt = (v, d = 2) => (v == null || !isFinite(v) ? "–" : v.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v) => (v == null || !isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${fmt(v, 1)} %`);

function ruleBasedText(s, value, newsWeek, q) {
  const parts = [];
  parts.push(`Kursen stängde på ${fmt(q.price, 3)} kr (${pct(q.changePct)} senaste dagen) och dina ${fmt(SHARES, 0)} aktier är värda ${fmt(value, 0)} kr.`);
  parts.push(`Utveckling: 1 vecka ${pct(s.ret1w)}, 1 månad ${pct(s.ret1m)}, 3 månader ${pct(s.ret3m)}, 1 år ${pct(s.ret1y)}.`);
  if (s.ma50 && s.ma200) {
    const trend = s.last > s.ma50 && s.ma50 > s.ma200 ? "positiv – kursen ligger över både 50- och 200-dagars medelvärde"
      : s.last < s.ma50 && s.ma50 < s.ma200 ? "negativ – kursen ligger under både 50- och 200-dagars medelvärde"
      : "blandad – kursen pendlar runt sina glidande medelvärden";
    parts.push(`Teknisk trend: ${trend} (MA50 ${fmt(s.ma50, 3)}, MA200 ${fmt(s.ma200, 3)}).`);
  }
  parts.push(`Årlig volatilitet ${fmt(s.volatility, 0)} % – ${s.volatility > 60 ? "mycket hög, typiskt för ett gruvbolag i projektfas" : "måttlig"}. Kursen ligger ${pct(s.fromHigh52)} från 52-veckorshögsta.`);
  parts.push(newsWeek.length ? `${newsWeek.length} nyheter senaste veckan, bl.a. ”${newsWeek[0].title}”.` : "Inga nya nyheter senaste veckan.");
  parts.push("Det viktigaste för aktien framåt är finansieringen och investeringsbeslutet (FID) för Sydvaranger.");
  return parts.join(" ");
}

async function claudeText(ctx) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "Du är en saklig aktieanalytiker som skriver en kort daglig uppdatering på svenska till en privatperson som äger aktier i gruvbolaget Grangex (projekt: återstart av järnmalmsgruvan Sydvaranger i Kirkenes, Norge). " +
      "Använd endast underlaget du får. Skriv 150–250 ord i löpande text utan rubriker: vad som hänt (kurs och nyheter), vad det betyder för bear-, base- och bull-scenariot, och vad man bör bevaka framåt. " +
      "Var ärlig om osäkerheten. Ge inga köp- eller säljråd.",
    messages: [{ role: "user", content: JSON.stringify(ctx) }],
  });
  if (response.stop_reason === "refusal") return null;
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  return text || null;
}

export async function buildDailyAnalysis(data) {
  const q = data.quote;
  if (!q?.price || !q.history?.length) return null;
  const s = F.stats(q.history);
  const value = q.price * SHARES;
  const scenarios = F.compute({ price: q.price, shares: SHARES });
  const weekAgo = Date.now() - 7 * 864e5;
  const newsWeek = (data.news || []).filter((n) => n.date && Date.parse(n.date) >= weekAgo);

  const ctx = {
    datum: todaySE(), antal_aktier: SHARES, kurs_sek: q.price, dagsforandring_pct: q.changePct, innehavsvarde_sek: Math.round(value),
    nyckeltal: s,
    prognos_sek: Object.fromEntries(Object.entries(scenarios).map(([k, rows]) => [k, rows.map((r) => ({ ar: r.years, varde: Math.round(r.value) }))])),
    scenarioantaganden: F.SCENARIOS,
    nyheter_senaste_veckan: newsWeek.slice(0, 20).map((n) => ({ datum: n.date?.slice(0, 10), rubrik: n.title, kalla: n.source })),
  };

  let text = null, ai = false;
  try { text = await claudeText(ctx); ai = !!text; } catch (e) { console.warn("AI-analys misslyckades:", e.message); }
  if (!text) text = ruleBasedText(s, value, newsWeek, q);

  return {
    date: todaySE(), created: new Date().toISOString(), price: q.price, shares: SHARES, value, stats: s,
    scenarios: Object.fromEntries(Object.entries(scenarios).map(([k, rows]) => [k, rows.map((r) => Math.round(r.value))])),
    newsCount7d: newsWeek.length, text, ai,
  };
}
