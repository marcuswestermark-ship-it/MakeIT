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
function renderAll() { renderHeader(); renderOverview(); renderNews(); renderMine(); renderTimeline(); }

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

// ---------- Händelser ----------
document.querySelectorAll(".tabs button, [data-goto]").forEach((b) => b.addEventListener("click", () => {
  const tab = b.dataset.tab || b.dataset.goto;
  document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("active", s.id === "tab-" + tab));
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === tab));
  window.scrollTo(0, 0);
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
