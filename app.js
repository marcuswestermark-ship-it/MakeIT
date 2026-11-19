"use strict";
// ---------- Lagring (egen data stannar på telefonen) ----------
const STORE_KEY = "grangex-mine-v1";
const defaults = { shares: 6850, gav: null, manualPrice: null, entries: [] };
function loadMine() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; } catch { return { ...defaults }; }
}
function saveMine() { try { localStorage.setItem(STORE_KEY, JSON.stringify(mine)); } catch { toast("Kunde inte spara"); } }
let mine = loadMine();
let data = { quote: null, news: [], errors: [] };
let chartDays = 365, newsFilter = "all";

// ---------- Hjälpare ----------
const $ = (s) => document.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const kr = (v, d = 0) => v == null || isNaN(v) ? "–" : v.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }) + " kr";
const num = (v, d = 2) => v == null || isNaN(v) ? "–" : v.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v) => v == null || isNaN(v) ? "–" : (v > 0 ? "+" : "") + v.toFixed(2).replace(".", ",") + " %";
const dateSv = (iso, time = false) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) + (time ? " " + d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "");
};
const ago = (iso) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${m} min sedan`;
  if (m < 1440) return `${Math.round(m / 60)} tim sedan`;
  return dateSv(iso);
};
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2500); }
const currentPrice = () => data.quote?.price ?? (mine.manualPrice || null);

// ---------- Hämta automatisk data ----------
async function loadData(manual) {
  $("#refreshBtn").classList.add("spin");
  try {
    const res = await fetch("data/data.json?t=" + Date.now(), { cache: "no-store" });
    data = await res.json();
    if (manual) toast("Uppdaterat");
  } catch {
    if (manual) toast("Offline – visar sparad data");
  }
  $("#refreshBtn").classList.remove("spin");
  renderAll();
}

// ---------- Rendering ----------
function renderAll() { renderHeader(); renderOverview(); renderNews(); renderMine(); renderTimeline(); renderForecast(); }

function renderHeader() {
  $("#updated").textContent = data.updated ? `Data hämtad ${ago(data.updated)}` : "Väntar på första automatiska hämtningen";
}

function renderOverview() {
  const q = data.quote, p = currentPrice();
  const value = p != null ? p * mine.shares : null;
  $("#holdValue").textContent = kr(value);
  $("#holdShares").textContent = `${num(mine.shares, 0)} aktier × ${p != null ? num(p, 3) + " kr" : "–"}${!q && mine.manualPrice ? " (egen kurs)" : ""}`;
  const pl = $("#holdPL");
  if (mine.gav && p != null) {
    const diff = (p - mine.gav) * mine.shares, r = (p / mine.gav - 1) * 100;
    pl.textContent = `${diff >= 0 ? "+" : ""}${kr(diff)} (${pct(r)})`;
    pl.className = diff >= 0 ? "up" : "down";
  } else { pl.textContent = mine.gav ? "" : "Ange GAV för vinst/förlust"; pl.className = "muted small"; }

  $("#price").textContent = p != null ? num(p, 3) + " kr" : "–";
  const ch = $("#change");
  if (q?.changePct != null) {
    const dayVal = (q.price - q.prevClose) * mine.shares;
    ch.textContent = `${pct(q.changePct)} idag (${dayVal >= 0 ? "+" : ""}${kr(dayVal)})`;
    ch.className = "small " + (q.changePct >= 0 ? "up" : "down");
  } else { ch.textContent = "Ingen dagsförändring"; ch.className = "small muted"; }
  $("#range52").textContent = q ? `${num(q.low52, 3)} – ${num(q.high52, 3)} kr` : "–";
  $("#quoteTime").textContent = q?.time ? `Senast handlad ${dateSv(q.time, true)}` : "";

  renderChart();

  const latest = (data.news || []).slice(0, 5);
  $("#latestNews").innerHTML = latest.length ? latest.map(newsItem).join("") : `<li class="empty">Inga nyheter hämtade ännu.</li>`;
  const ents = sortedEntries().slice(0, 3);
  $("#latestMine").innerHTML = ents.length
    ? ents.map((e) => `<li><div>${esc(e.title)}</div><div class="meta"><span>${dateSv(e.date)}</span><span class="badge">${TYPES[e.type]}</span></div></li>`).join("")
    : `<li class="empty">Inga egna anteckningar än – lägg till under ”Mina data”.</li>`;

  const errs = data.errors || [];
  $("#errorsCard").hidden = !errs.length;
  $("#errors").innerHTML = errs.map((e) => `<li>${esc(e)}</li>`).join("");
}

function renderChart() {
  const el = $("#chart"), hist = data.quote?.history || [];
  const cutoff = Date.now() - chartDays * 864e5;
  const pts = hist.filter((p) => p[0] >= cutoff);
  if (pts.length < 2) { el.innerHTML = `<div class="empty">Kurshistorik saknas ännu.</div>`; $("#chartInfo").textContent = ""; return; }
  const W = el.clientWidth || 600, H = el.clientHeight || 180, P = 6;
  const ys = pts.map((p) => p[1]), min = Math.min(...ys), max = Math.max(...ys);
  const t0 = pts[0][0], t1 = pts.at(-1)[0];
  const x = (t) => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = (v) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  const up = ys.at(-1) >= ys[0], col = up ? "var(--up)" : "var(--down)";
  // Markera egna köp/sälj i grafen
  const trades = mine.entries.filter((e) => e.type === "trade" && e.tradePrice && new Date(e.date) >= cutoff)
    .map((e) => `<circle cx="${x(+new Date(e.date)).toFixed(1)}" cy="${y(e.tradePrice).toFixed(1)}" r="5" fill="var(--accent)" stroke="#111" stroke-width="1.5"><title>${esc(e.title)}</title></circle>`).join("");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Kursgraf">
    <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${up ? "#4cc38a" : "#ef6b6b"}" stop-opacity=".28"/><stop offset="1" stop-opacity="0"/></linearGradient></defs>
    <path d="${line}L${x(t1)},${H}L${x(t0)},${H}Z" fill="url(#g)"/>
    <path d="${line}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/>${trades}</svg>`;
  const chg = (ys.at(-1) / ys[0] - 1) * 100;
  $("#chartInfo").innerHTML = `${dateSv(new Date(t0).toISOString())} – ${dateSv(new Date(t1).toISOString())} · lägst ${num(min, 3)} · högst ${num(max, 3)} · <span class="${up ? "up" : "down"}">${pct(chg)}</span>`;
}

const LANG = { sv: "Svenska", no: "Norska", en: "Engelska" };
function newsItem(n) {
  return `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
    <div class="meta"><span>${esc(n.source)}</span><span>${n.date ? dateSv(n.date) : ""}</span>${n.press ? `<span class="badge press">Pressmeddelande</span>` : `<span class="badge">${LANG[n.lang] || ""}</span>`}</div></li>`;
}
function renderNews() {
  const q = $("#newsSearch").value.trim().toLowerCase();
  const list = (data.news || []).filter((n) =>
    (newsFilter === "all" || (newsFilter === "press" ? n.press : n.lang === newsFilter && !n.press)) &&
    (!q || (n.title + " " + n.source).toLowerCase().includes(q)));
  $("#newsList").innerHTML = list.length ? list.map(newsItem).join("") : `<li class="empty">Inga nyheter matchar.</li>`;
}

// ---------- Egen data ----------
const TYPES = { note: "Anteckning", event: "Händelse", link: "Länk", number: "Nyckeltal", trade: "Köp/sälj" };
const sortedEntries = () => [...mine.entries].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);

function renderMine() {
  const f = $("#holdForm");
  f.shares.value = mine.shares ?? ""; f.gav.value = mine.gav ?? ""; f.manualPrice.value = mine.manualPrice ?? "";
  const q = $("#mineSearch").value.trim().toLowerCase();
  const list = sortedEntries().filter((e) => !q || `${e.title} ${e.text} ${e.url}`.toLowerCase().includes(q));
  $("#mineList").innerHTML = list.length ? list.map((e) => `<li>
      <div><b>${esc(e.title)}</b></div>
      <div class="meta"><span>${dateSv(e.date)}</span><span class="badge">${TYPES[e.type]}</span>
        ${e.value != null && e.value !== "" ? `<span>Värde: ${esc(e.value)}</span>` : ""}${e.tradePrice ? `<span>à ${esc(e.tradePrice)} kr</span>` : ""}</div>
      ${e.text ? `<div class="entry-text">${esc(e.text)}</div>` : ""}
      ${e.url ? `<div class="small"><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url)}</a></div>` : ""}
      <div class="entry-actions"><button class="link" data-edit="${e.id}">Redigera</button><button class="link" data-del="${e.id}">Ta bort</button></div>
    </li>`).join("") : `<li class="empty">Inget sparat ännu.</li>`;
}

function updateTypeFields() {
  const t = $("#entryForm").type.value;
  document.querySelectorAll("#entryForm [class^='f-'], #entryForm [class*=' f-']").forEach((el) => {
    el.hidden = ![...el.classList].some((c) => c === "f-" + t) && !(el.classList.contains("f-link"));
  });
}

function resetEntryForm() {
  const f = $("#entryForm"); f.reset(); f.id.value = ""; f.date.value = new Date().toISOString().slice(0, 10);
  $("#entryFormTitle").textContent = "Lägg till egen data"; $("#cancelEdit").hidden = true; updateTypeFields();
}

// ---------- Tidslinje ----------
const TIMELINE = [
  { when: "2024–2025", text: "Grangex förvärvar Sydvaranger-gruvan vid Kirkenes, Norge." },
  { when: "Dec 2025", text: "Kommersiellt partnerskap med Anglo American för återstarten av Sydvaranger." },
  { when: "Jan 2026", text: "Avtal om gruvtjänster med finska E. Hartikainen Oy – bolagets största driftsavtal hittills." },
  { when: "2026", text: "Avtal med Metso om leverans av processutrustning till Sydvaranger." },
  { when: "H1 2026", text: "Finansiering på ca 300 MUSD söks; finansieringsrundan flyttas från Q1 till H1 2026." },
  { when: "29 maj 2026", text: "Pressmeddelande om reviderad tidplan för investeringsbeslut (FID) för Sydvaranger." },
  { when: "5 nov 2026", text: "Gråbergssand (tailings) utreds som råvara för industrin." },
  { when: "19 nov 2026", text: "Q3-rapport enligt bolagets kalender." },
  { when: "Mål", text: "Första kommersiella leveranser av järnmalmskoncentrat – tidigare kommunicerat Q4 2026, men tidplanen har reviderats. Följ nyheterna." },
];
function renderTimeline() {
  const own = mine.entries.filter((e) => e.type === "event").sort((a, b) => a.date.localeCompare(b.date));
  $("#timeline").innerHTML = TIMELINE.map((t) => `<li><div class="when">${esc(t.when)}</div>${esc(t.text)}</li>`).join("") +
    own.map((e) => `<li class="mine"><div class="when">${dateSv(e.date)} · egen</div>${esc(e.title)}</li>`).join("");
}

// ---------- Prognos ----------
const SC_KEYS = ["bear", "base", "bull"];
const SC_ICON = { bear: "🐻", base: "⚖️", bull: "🐂" };
const horizonLabel = (y) => (y === 0 ? "Nu" : `${y} år`);
const assumptions = () => mine.assumptions || Forecast.defaultAssumptions();
const forecastNow = () => {
  const p = currentPrice();
  return p == null ? null : Forecast.compute({ price: p, shares: mine.shares, assumptions: assumptions() });
};

function renderForecast() {
  const fc = forecastNow(), sel = mine.scenario || "base";
  document.querySelectorAll("#scenSeg button").forEach((b) => b.classList.toggle("on", b.dataset.s === sel));
  const card = $("#scenCard");
  card.className = "card scen-card " + sel;
  if (!fc) {
    const msg = `<div class="empty">Ingen kurs ännu – ange ”Egen kurs” under Mina data eller vänta på första automatiska hämtningen.</div>`;
    card.innerHTML = msg; $("#fTable").innerHTML = ""; $("#fChart").innerHTML = ""; $("#miniForecast").innerHTML = msg;
  } else {
    const rows = fc[sel], a = assumptions()[sel], now = rows[0].value;
    card.innerHTML = `<div class="label">${SC_ICON[sel]} ${Forecast.SCENARIOS[sel].name}-scenario · ${num(mine.shares, 0)} aktier</div>
      <div class="big">${kr(rows.at(-1).value)}</div><div class="small muted">om 20 år (${rows.at(-1).year}) · antagande ${pct(a.early)}/år år 1–5, ${pct(a.late)}/år därefter</div>
      <div class="scen-rows">${rows.map((r) => `<span>${horizonLabel(r.years)} <span class="muted small">${r.year}</span></span>
        <span class="v">${kr(r.value)}</span><span class="x">${num(r.price, 2)} kr/aktie · ${r.years ? "×" + num(r.value / now, 1) : "idag"}</span>`).join("")}</div>
      <p class="story">${esc(Forecast.SCENARIOS[sel].story)}</p>`;
    $("#fTable").innerHTML = `<tr><th>Tid</th>${SC_KEYS.map((k) => `<th class="c-${k} ${k === sel ? "sel" : ""}">${Forecast.SCENARIOS[k].name}</th>`).join("")}</tr>` +
      Forecast.HORIZONS.map((y, i) => `<tr><td>${horizonLabel(y)}</td>${SC_KEYS.map((k) => `<td class="${k === sel ? "sel" : ""}">${kr(fc[k][i].value)}</td>`).join("")}</tr>`).join("");
    renderForecastChart(fc);
    const i5 = Forecast.HORIZONS.indexOf(5);
    $("#miniForecast").innerHTML = SC_KEYS.map((k) => `<div>${SC_ICON[k]} ${Forecast.SCENARIOS[k].name} · 5 år<b class="c-${k}">${kr(fc[k][i5].value)}</b></div>`).join("");
  }
  renderAssumptions(); renderAnalysis(); renderCalcHistory();
}

function renderForecastChart(fc) {
  const el = $("#fChart"), W = el.clientWidth || 600, H = el.clientHeight || 220, P = 8, L = 54;
  const all = SC_KEYS.flatMap((k) => fc[k].map((r) => r.value)).filter((v) => v > 0);
  const lo = Math.log10(Math.min(...all)), hi = Math.log10(Math.max(...all));
  const x = (y) => L + (y / 20) * (W - L - P), yv = (v) => H - P - ((Math.log10(Math.max(v, 1e-9)) - lo) / (hi - lo || 1)) * (H - 2 * P);
  const col = { bear: "var(--down)", base: "#8fb3ff", bull: "var(--up)" };
  const paths = SC_KEYS.map((k) => {
    const sc = assumptions()[k], start = fc[k][0].value;
    const d = Array.from({ length: 41 }, (_, i) => i / 2).map((y, i) => `${i ? "L" : "M"}${x(y).toFixed(1)},${yv(start * Forecast.factor(y, sc)).toFixed(1)}`).join("");
    return `<path d="${d}" fill="none" stroke="${col[k]}" stroke-width="${k === (mine.scenario || "base") ? 3 : 1.5}"/>`;
  }).join("");
  const ticks = [];
  for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) for (const m of [1, 3]) { const v = m * 10 ** e; if (Math.log10(v) >= lo && Math.log10(v) <= hi) ticks.push(v); }
  const tk = ticks.map((v) => `<line x1="${L}" x2="${W - P}" y1="${yv(v)}" y2="${yv(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${yv(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${v >= 1e6 ? num(v / 1e6, 0) + " M" : v >= 1e3 ? num(v / 1e3, 0) + " k" : num(v, 0)}</text>`).join("");
  const xt = Forecast.HORIZONS.map((y) => `<text x="${x(y)}" y="${H - 1}" text-anchor="middle" font-size="10" fill="var(--muted)">${y ? y + "å" : ""}</text>`).join("");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Prognosgraf">${tk}${xt}${paths}</svg>`;
}

function renderAssumptions() {
  const a = assumptions(), f = $("#assumpForm");
  if (f.contains(document.activeElement)) return;
  f.innerHTML = `<span></span><span class="h">År 1–5</span><span class="h">År 6+</span>` + SC_KEYS.map((k) =>
    `<span class="c-${k}">${SC_ICON[k]} ${Forecast.SCENARIOS[k].name}</span>
     <input type="number" step="0.5" inputmode="decimal" name="${k}-early" value="${a[k].early}" aria-label="${k} år 1-5">
     <input type="number" step="0.5" inputmode="decimal" name="${k}-late" value="${a[k].late}" aria-label="${k} år 6+">`).join("");
}

function renderAnalysis() {
  const list = data.analyses || [], a = list[0];
  if (!a) {
    $("#analysisText").innerHTML = `<span class="muted">Den första dagliga analysen skapas vid nästa automatiska körning.</span>`;
    $("#analysisStats").innerHTML = ""; $("#analysisDate").textContent = ""; $("#analysisHistoryWrap").hidden = true; return;
  }
  $("#analysisDate").textContent = `${dateSv(a.created)} · ${a.ai ? "skriven av Claude" : "automatisk"}`;
  $("#analysisText").textContent = a.text;
  const s = a.stats || {};
  const cell = (l, v) => `<div>${l}<b>${v}</b></div>`;
  $("#analysisStats").innerHTML = cell("1 vecka", pct(s.ret1w)) + cell("1 månad", pct(s.ret1m)) + cell("1 år", pct(s.ret1y)) +
    cell("MA50", num(s.ma50, 3)) + cell("MA200", num(s.ma200, 3)) + cell("Volatilitet", s.volatility != null ? num(s.volatility, 0) + " %" : "–");
  $("#analysisHistoryWrap").hidden = list.length < 2;
  $("#analysisHistory").innerHTML = list.slice(1, 60).map((x) => `<li><div class="meta"><span>${x.date}</span><span>${num(x.price, 3)} kr</span><span>${kr(x.value)}</span></div>
    <div class="small muted">Bear/Base/Bull om 5 år: ${SC_KEYS.map((k) => kr(x.scenarios?.[k]?.[2])).join(" / ")}</div>
    <div class="entry-text small">${esc(x.text)}</div></li>`).join("");
}

function renderCalcHistory() {
  const c = mine.calcs || [];
  $("#calcHistory").innerHTML = c.length ? c.slice(0, 30).map((x) => `<li><div class="meta"><span>${dateSv(x.at, true)}</span><span>${num(x.price, 3)} kr × ${num(x.shares, 0)}</span></div>
    <div class="small">Nu ${kr(x.now)} · 5 år: <span class="c-bear">${kr(x.y5.bear)}</span> / <span class="c-base">${kr(x.y5.base)}</span> / <span class="c-bull">${kr(x.y5.bull)}</span></div>
    <div class="small muted">20 år: ${kr(x.y20.bear)} / ${kr(x.y20.base)} / ${kr(x.y20.bull)}</div></li>`).join("")
    : `<li class="empty">Tryck på ”Räkna ut prognos nu” för att spara en uträkning.</li>`;
}

async function calculateNow() {
  const btn = $("#calcBtn"); btn.disabled = true; btn.textContent = "Hämtar senaste kursen…";
  await loadData();
  btn.disabled = false; btn.textContent = "Räkna ut prognos nu";
  const fc = forecastNow();
  if (!fc) return toast("Ingen kurs tillgänglig");
  const i5 = Forecast.HORIZONS.indexOf(5), pick = (i) => Object.fromEntries(SC_KEYS.map((k) => [k, fc[k][i].value]));
  mine.calcs = [{ at: new Date().toISOString(), price: currentPrice(), shares: mine.shares, now: fc.base[0].value, y5: pick(i5), y20: pick(Forecast.HORIZONS.length - 1) }, ...(mine.calcs || [])].slice(0, 100);
  saveMine(); renderForecast();
  $("#calcInfo").textContent = `Uträknad ${dateSv(new Date().toISOString(), true)} med kursen ${num(currentPrice(), 3)} kr${data.quote?.time ? ` (senast handlad ${dateSv(data.quote.time, true)})` : ""}.`;
  toast("Prognos uträknad");
}

$("#calcBtn").addEventListener("click", calculateNow);
$("#scenSeg").addEventListener("click", (e) => { const s = e.target.closest("button")?.dataset.s; if (!s) return; mine.scenario = s; saveMine(); renderForecast(); });
$("#assumpSave").addEventListener("click", () => {
  const f = $("#assumpForm"), a = {};
  for (const k of SC_KEYS) a[k] = { early: +f[`${k}-early`].value || 0, late: +f[`${k}-late`].value || 0 };
  mine.assumptions = a; saveMine(); document.activeElement.blur(); renderForecast(); toast("Antaganden sparade");
});
$("#assumpReset").addEventListener("click", () => { delete mine.assumptions; saveMine(); document.activeElement.blur(); renderForecast(); toast("Återställt"); });

// ---------- Händelser ----------
document.querySelectorAll(".tabs button, [data-goto]").forEach((b) => b.addEventListener("click", () => {
  const tab = b.dataset.tab || b.dataset.goto;
  document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("active", s.id === "tab-" + tab));
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === tab));
  window.scrollTo(0, 0);
  if (tab === "forecast") renderForecast();
}));
$("#refreshBtn").addEventListener("click", () => loadData(true));
$("#rangeSeg").addEventListener("click", (e) => {
  if (!e.target.dataset.r) return;
  chartDays = +e.target.dataset.r;
  document.querySelectorAll("#rangeSeg button").forEach((b) => b.classList.toggle("on", b === e.target));
  renderChart();
});
$("#newsFilter").addEventListener("click", (e) => {
  if (!e.target.dataset.f) return;
  newsFilter = e.target.dataset.f;
  document.querySelectorAll("#newsFilter button").forEach((b) => b.classList.toggle("on", b === e.target));
  renderNews();
});
$("#newsSearch").addEventListener("input", renderNews);
$("#mineSearch").addEventListener("input", renderMine);

$("#holdForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, n = (v) => (v === "" ? null : +v);
  mine.shares = n(f.shares.value) ?? 0; mine.gav = n(f.gav.value); mine.manualPrice = n(f.manualPrice.value);
  saveMine(); renderAll(); toast("Innehav sparat");
});

$("#entryForm").type.addEventListener("change", updateTypeFields);
$("#entryForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const entry = {
    id: f.id.value || crypto.randomUUID?.() || String(Date.now()),
    type: f.type.value, date: f.date.value, title: f.title.value.trim(), text: f.text.value.trim(), url: f.url.value.trim(),
    value: f.value.value, tradePrice: f.tradePrice.value ? +f.tradePrice.value : null, created: Date.now(),
  };
  const i = mine.entries.findIndex((x) => x.id === entry.id);
  if (i >= 0) { entry.created = mine.entries[i].created; mine.entries[i] = entry; } else mine.entries.push(entry);
  saveMine(); resetEntryForm(); renderAll(); toast("Sparat");
});
$("#cancelEdit").addEventListener("click", resetEntryForm);
$("#mineList").addEventListener("click", (e) => {
  const { edit, del } = e.target.dataset;
  if (del && confirm("Ta bort posten?")) { mine.entries = mine.entries.filter((x) => x.id !== del); saveMine(); renderAll(); }
  if (edit) {
    const x = mine.entries.find((y) => y.id === edit), f = $("#entryForm");
    for (const k of ["id", "type", "date", "title", "text", "url", "value", "tradePrice"]) f[k].value = x[k] ?? "";
    $("#entryFormTitle").textContent = "Redigera"; $("#cancelEdit").hidden = false; updateTypeFields();
    f.scrollIntoView({ behavior: "smooth" });
  }
});

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(mine, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `grangex-backup-${new Date().toISOString().slice(0, 10)}.json` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const imp = JSON.parse(await file.text());
    if (!Array.isArray(imp.entries)) throw 0;
    const ids = new Set(mine.entries.map((x) => x.id));
    mine = { ...mine, ...imp, entries: [...mine.entries, ...imp.entries.filter((x) => !ids.has(x.id))] };
    saveMine(); renderAll(); toast(`Importerade ${imp.entries.length} poster`);
  } catch { toast("Ogiltig fil"); }
  e.target.value = "";
});

// ---------- Installation (Android) ----------
let installPrompt;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; $("#installBtn").hidden = false; });
$("#installBtn").addEventListener("click", async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $("#installBtn").hidden = true; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadData(); });

resetEntryForm();
renderAll();
loadData();
