"use strict";
const DATA = window.FM_DATA || {};
const SAVE_KEY = "fotbollsmanager-v1";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r1 = (v) => Math.round(v);
const acls = (v) => (v <= 7 ? "a1" : v <= 10 ? "a2" : v <= 13 ? "a3" : v <= 16 ? "a4" : "a5");
const acol = (v) => ["#e66161", "#f0a04b", "#d9d24a", "#5fd38a", "#2fe39a"][Math.min(4, Math.floor((v - 1) / 4))];

let S = null;            // spelets tillstånd
let view = "home";       // aktiv flik
let setup = { mode: "normal", league: null, team: null };
let ui = { tableLeague: null, tableTab: "tabell", tfPos: "", tfLeague: "", tfMax: "", tfSort: "ovr", tfQuery: "", draftPos: "", slotSel: null, squadSort: "pos" };

// ---------- Lagring ----------
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S, (k, v) => (k[0] === "_" && k !== "_origin" ? undefined : v))); } catch (e) { toast("Kunde inte spara spelet"); } }
function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch { return null; } }
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600); }

// ---------- Hjälpare ----------
const me = () => S.teams[S.userTeam];
const P = (id) => S.players[id];
const T = (id) => S.teams[id];
const seasonLabel = () => `${S.season}/${String(S.season + 1).slice(2)}`;
function crest(t, cls = "crest") { return `<div class="${cls}" style="background:${t.color};color:${t.color2};border-color:${t.color2}">${esc(t.short)}</div>`; }
const ovrBadge = (p, pos) => { const o = FM.ovr(p, pos); return `<div class="ovr ${acls(o)}">${r1(o)}</div>`; };
const showAttrs = (p) => (p.pos === "MV" ? [6, 2, 5, 0] : [0, 1, 2, 3, 4, 5]);
function attrCells(p) { return `<div class="attrs">${showAttrs(p).map((i) => `<i class="${acls(p.a[i])}">${p.a[i]}</i>`).join("")}</div>`; }
const attrHead = `<div class="attrs-head"><i>FAR</i><i>TEK</i><i>PAS</i><i>AVS</i><i>FÖR</i><i>FYS</i></div>`;
function playerRow(p, extra = "", attr = "") {
  return `<li data-p="${p.id}" ${attr}><span class="pos ${p.pos}">${p.pos}</span>${ovrBadge(p)}<div class="nm"><b>${esc(p.name)}</b><span>${p.age} år · ${FM.money(FM.value(p))}${extra}</span></div>${attrCells(p)}</li>`;
}
const stars = (rep) => "★".repeat(Math.max(1, Math.round((rep - 6) / 3))).padEnd(5, "☆");
const posOrder = { MV: 0, B: 1, M: 2, A: 3 };

// ---------- Rendering ----------
function render() {
  const app = $("#app");
  if (!S) { app.innerHTML = renderSetup(); document.body.style.paddingBottom = "20px"; return; }
  if (S.draft) { app.innerHTML = renderDraft(); document.body.style.paddingBottom = "20px"; return; }
  if (S.fired) { app.innerHTML = renderFired(); document.body.style.paddingBottom = "20px"; return; }
  document.body.style.paddingBottom = "";
  const t = me();
  app.innerHTML = `
    <div class="top">${crest(t)}<div class="club"><b>${esc(t.name)}</b><span>${seasonLabel()} · omg ${Math.min(S.round + 1, S.leagues[t.league].fixtures.length)}/${S.leagues[t.league].fixtures.length} · ${FM.money(t.budget)}</span></div>
      <button class="icon-btn" data-act="menu" aria-label="Meny">⚙</button></div>
    <div class="wrap">${{ home: renderHome, squad: renderSquad, tactic: renderTactic, table: renderTable, transfer: renderTransfer }[view]()}</div>
    <nav class="tabs">${[["home", "⌂", "Hem"], ["squad", "👥", "Trupp"], ["tactic", "▦", "Taktik"], ["table", "☰", "Tabell"], ["transfer", "⇄", "Transfer"]]
      .map(([k, i, l]) => `<button data-view="${k}" class="${view === k ? "on" : ""}"><span>${i}</span>${l}</button>`).join("")}</nav>`;
}

// ----- Start / nytt spel -----
function renderSetup() {
  const saved = load();
  if (!setup.step) {
    return `<div class="wrap"><div class="hero"><div class="ball">⚽</div><h1>Fotbollsmanager</h1><p class="muted">Premier League · La Liga · Bundesliga · Ligue 1 · Serie A</p></div>
      ${saved ? `<button class="btn full" data-act="continue">Fortsätt – ${esc(saved.teams[saved.userTeam]?.name || "")} ${saved.season}/${String(saved.season + 1).slice(2)}</button><div style="height:10px"></div>` : ""}
      <button class="btn ${saved ? "ghost" : ""} full" data-act="new">Nytt spel</button>
      <p class="small muted center" style="margin-top:24px">Spelare och betyg bygger på trupperna som de såg ut senast jag kände till dem – vissa övergångar kan saknas.</p></div>`;
  }
  if (setup.step === 1) {
    return `<div class="wrap"><h2>Välj spelläge</h2>
      <button class="pickcard ${setup.mode === "normal" ? "on" : ""}" data-mode="normal"><b>⚽ Vanligt läge</b><div class="small muted">Ta över ett lag med dess riktiga trupp och budget.</div></button>
      <button class="pickcard ${setup.mode === "draft" ? "on" : ""}" data-mode="draft"><b>🎲 Draft</b><div class="small muted">Alla lag i din liga börjar tomma. Du och datorlagen väljer spelare turvis (ormdraft, 18 rundor) ur ligans spelare.</div></button>
      <button class="btn full" data-act="step2">Nästa</button><div style="height:8px"></div><button class="btn ghost full" data-act="back">Tillbaka</button></div>`;
  }
  if (setup.step === 2) {
    return `<div class="wrap"><h2>Välj liga</h2>${Object.entries(DATA).map(([id, L]) =>
      `<button class="pickcard" data-league="${id}"><b>${esc(L.name)}</b><div class="small muted">${esc(L.country)} · ${L.teams.length} lag</div></button>`).join("")}
      <button class="btn ghost full" data-act="step1">Tillbaka</button></div>`;
  }
  const L = DATA[setup.league];
  return `<div class="wrap"><h2>Välj lag – ${esc(L.name)}</h2><div class="teamlist">${L.teams.map((t) => {
    const id = t.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<button class="pickcard ${setup.team === id ? "on" : ""}" data-team="${id}">${crest(t)}<div style="flex:1"><b>${esc(t.name)}</b><div class="stars">${stars(t.rep)}</div></div></button>`;
  }).join("")}</div>
    <div style="position:sticky;bottom:10px"><button class="btn full" data-act="start" ${setup.team ? "" : "disabled"}>${setup.mode === "draft" ? "Starta draften" : "Starta karriären"}</button></div>
    <div style="height:8px"></div><button class="btn ghost full" data-act="step2">Tillbaka</button></div>`;
}

// ----- Draft -----
function renderDraft() {
  const d = S.draft, n = d.order.length, onClock = FM.draftTeamOnClock(S), mine = onClock === S.userTeam;
  const round = Math.floor(d.pick / n) + 1, need = FM.needFor(S, me());
  const pool = d.pool.map(P).filter((p) => !ui.draftPos || p.pos === ui.draftPos).sort((a, b) => FM.ovr(b) - FM.ovr(a)).slice(0, 80);
  const myPlayers = me().players.map(P).sort((a, b) => posOrder[a.pos] - posOrder[b.pos] || FM.ovr(b) - FM.ovr(a));
  const last = d.log.slice(-6).reverse();
  return `<div class="top">${crest(me())}<div class="club"><b>Draft – ${esc(S.leagues[d.league].name)}</b><span>Runda ${Math.min(round, d.rounds)}/${d.rounds} · val ${d.pick + 1}/${d.rounds * n}</span></div></div>
  <div class="wrap">
    <div class="clockbox ${mine ? "me" : ""}">${mine ? "<b>Din tur att välja!</b>" : `${esc(T(onClock).name)} väljer…`}</div>
    <div class="need">${FM.POS.map((p) => `<span class="${need[p] <= 0 ? "done" : ""}"><b>${p}</b> ${FM.QUOTA[p] - need[p]}/${FM.QUOTA[p]}</span>`).join("")}</div>
    <div style="height:10px"></div>
    <div class="btn-row"><button class="btn ghost" data-act="draft-auto1" ${mine ? "" : "disabled"}>Välj åt mig</button><button class="btn ghost" data-act="draft-autoall">Autodrafta resten</button></div>
    <div style="height:10px"></div>
    <div class="seg" id="draftPos">${[["", "Alla"], ["MV", "MV"], ["B", "Back"], ["M", "Mitt"], ["A", "Anfall"]].map(([k, l]) => `<button data-dpos="${k}" class="${ui.draftPos === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="card" style="margin-top:10px;padding:8px 10px">${attrHead}<ul class="plist">${pool.map((p) => playerRow(p, ` · ${esc(T(DATA_TEAM_OF[p.id] || "")?.short || "")}`, `data-draft="${p.id}"`)).join("")}</ul></div>
    ${last.length ? `<div class="card"><h3>Senaste valen</h3><ul class="news">${last.map((x) => `<li>#${x.pick} <b>${esc(T(x.team).short)}</b> – ${esc(P(x.pid).name)} <span class="muted small">(${P(x.pid).pos}, ${r1(FM.ovr(P(x.pid)))})</span></li>`).join("")}</ul></div>` : ""}
    <div class="card"><h3>Din trupp (${myPlayers.length}/18)</h3><ul class="plist">${myPlayers.map((p) => playerRow(p)).join("") || `<li class="muted">Inga spelare ännu</li>`}</ul></div>
  </div>`;
}
let DATA_TEAM_OF = {}; // spelare -> ursprungligt lag (för draftlistan)

// ----- Hem -----
const STAGE = { group: "Gruppspel", qf: "Kvartsfinal", sf: "Semifinal", final: "Final", done: "Avgjord" };
const dayLabel = (day) => (day[0] === "group" ? `Europacupen · gruppspel ${day[1] + 1}/6` : `Europacupen · ${STAGE[day[0]].toLowerCase()}`);
function nextEvent() {
  const day = FM.cupDayPending(S);
  if (day) { const f = FM.cupUserFixture(S, day); if (f) return { kind: "cup", day, h: f.h, a: f.a, neutral: f.neutral }; }
  const fx = FM.userFixture(S);
  return fx ? { kind: "league", h: fx[0], a: fx[1] } : null;
}
function boardCard() {
  if (!S.board?.target) return "";
  const b = S.board, mood = FM.boardMood(S), conf = b.confidence;
  const cs = FM.cupStatus(S);
  return `<div class="card"><div class="row between"><h3>Styrelsen</h3><span class="small ${mood.diff >= 0 ? "up" : "down"}">${mood.text}</span></div>
    <div class="row between small"><span>Mål: <b>${esc(b.text)}</b> (plats ${b.target} eller bättre)</span><span>Nu: <b>${mood.pos}:a</b></span></div>
    ${b.cupTarget ? `<div class="small muted" style="margin-top:4px">Europacupen: nå minst <b>${b.cupTarget.toLowerCase()}</b> · nu: ${cs}</div>` : cs ? `<div class="small muted" style="margin-top:4px">Europacupen: ${cs}</div>` : ""}
    <div class="strength" style="margin-top:10px"><span class="small muted">Förtroende</span><div class="bar"><span style="width:${conf}%;background:${conf >= 60 ? "var(--green)" : conf >= 35 ? "var(--accent)" : "var(--red)"}"></span></div><b class="small">${conf}%</b></div>
    <p class="tiny muted" style="margin:6px 0 0">Styrelsen bedömer dig när säsongen är slut. Under 25 % förtroende får du sparken.</p></div>`;
}
function renderHome() {
  const t = me(), L = S.leagues[t.league];
  if (FM.seasonOver(S)) {
    const tab = FM.sortedTable(L), pos = tab.findIndex((r) => r.id === t.id) + 1, b = S.board;
    const cw = S.cup?.winner ? T(S.cup.winner) : null;
    return `<div class="card center"><h3>Säsongen ${seasonLabel()} är slut</h3><div class="score">${pos}:a</div><p>${esc(t.name)} slutade på ${pos}:e plats med ${tab[pos - 1].pts} poäng.</p>
      ${b?.target ? `<p class="${pos <= b.target ? "up" : "down"}">${pos <= b.target ? "✓ Styrelsens mål uppnått" : "✗ Styrelsens mål missat"} (${esc(b.text)})</p>` : ""}
      ${cw ? `<p class="small">🏆 Europacupen: <b>${esc(cw.name)}</b>${FM.userInCup(S) ? ` · du: ${FM.cupStatus(S)}` : ""}</p>` : ""}
      <p class="small muted">Mästare: ${Object.values(S.leagues).map((l) => `${esc(l.name)}: <b>${esc(T(FM.sortedTable(l)[0].id).name)}</b>`).join(" · ")}</p>
      <button class="btn full" data-act="next-season">Avsluta säsongen</button><p class="small muted">Styrelsen ger sitt omdöme. Spelarna blir ett år äldre, unga utvecklas, äldre tappar och vissa slutar.</p></div>` + boardCard() + renderNews();
  }
  const ev = nextEvent();
  if (!ev) {
    return `<div class="card center"><h3>Din liga är färdigspelad</h3><p class="small muted">Övriga ligor och Europacupen spelar klart.</p><button class="btn full" data-act="quick">⏩ Spela vidare</button></div>` + boardCard() + renderLastRound();
  }
  const home = ev.h === t.id, opp = T(home ? ev.a : ev.h);
  const tab = FM.sortedTable(L), posOf = (id) => { const i = tab.findIndex((r) => r.id === id); return i >= 0 ? `${i + 1}:a` : esc(S.leagues[T(id).league].name); };
  const okLine = FM.validLineup(S, t);
  const st = FM.strength(S, t), so = FM.strength(S, opp);
  const title = ev.kind === "cup" ? `🏆 ${dayLabel(ev.day)}` : `Nästa match · omgång ${S.round + 1}`;
  return `<div class="card next ${ev.kind === "cup" ? "cupcard" : ""}"><h3>${title}</h3>
      <div class="vs"><div class="side">${crest(T(ev.h))}<span>${esc(T(ev.h).name)}</span><span class="small muted">${posOf(ev.h)}</span></div>
      <div class="muted">vs</div>
      <div class="side">${crest(T(ev.a))}<span>${esc(T(ev.a).name)}</span><span class="small muted">${posOf(ev.a)}</span></div></div>
      <div class="small muted">${ev.neutral ? "Neutral plan" : home ? "Hemma" : "Borta"} · ${t.tactic.formation} · ${FM.MENTALITY[t.tactic.mentality]} · press ${FM.PRESS[t.tactic.press].toLowerCase()}</div>
      <div class="strength" style="margin:12px 0">${[["Anfall", "att"], ["Mittfält", "mid"], ["Försvar", "def"]].map(([l, k]) =>
        `<span class="small muted">${l}</span><div class="bar"><span style="width:${Math.min(100, st[k] / 20 * 100)}%;background:${st[k] >= so[k] ? "var(--green)" : "var(--red)"}"></span></div><span class="small">${st[k].toFixed(1)} <span class="muted">/ ${so[k].toFixed(1)}</span></span>`).join("")}</div>
      ${okLine ? "" : `<p class="small down">Din startelva är inte komplett – den bästa elvan väljs automatiskt.</p>`}
      <div class="btn-row"><button class="btn" data-act="play">▶ Spela</button><button class="btn ghost" data-act="quick">⏩ Snabbspela</button></div>
      <div style="height:8px"></div><button class="btn ghost full small" data-act="quick5">Snabbspela 5 omgångar</button></div>
    ${renderLastRound()}
    ${boardCard()}
    <div class="card"><div class="row between"><h3>Tabelltopp</h3><button class="chip" data-view="table">Hela tabellen</button></div>${miniTable(L)}</div>
    ${renderNews()}`;
}
function renderFired() {
  const h = S.history[0], old = T(h.team), offers = S.jobOffers || (S.jobOffers = FM.jobOffers(S));
  return `<div class="wrap"><div class="hero"><div class="ball">📉</div><h1>Du har fått sparken</h1>
    <p class="muted">Styrelsen i ${esc(old.name)} har tappat förtroendet (${h.board.confidence}%) efter plats ${h.user.pos} – målet var ${esc(h.board.text.toLowerCase())}.</p></div>
    <h3>Klubbar som vill anställa dig</h3>${offers.map((id) => { const t = T(id); return `<button class="pickcard" data-job="${id}" style="display:flex;align-items:center;gap:12px">${crest(t)}<div style="flex:1"><b>${esc(t.name)}</b><div class="small muted">${esc(S.leagues[t.league].name)} · <span class="stars">${stars(t.rep)}</span></div></div></button>`; }).join("")}
    <div style="height:10px"></div><button class="btn ghost full" data-act="reset">Avsluta karriären och börja om</button></div>`;
}
function miniTable(L) {
  const tab = FM.sortedTable(L), i = tab.findIndex((r) => r.id === S.userTeam);
  const rows = tab.filter((r, k) => k < 4 || Math.abs(k - i) <= 1);
  return `<table class="tbl"><tr><th>#</th><th class="t">Lag</th><th>M</th><th>+/-</th><th>P</th></tr>${rows.map((r) => {
    const k = tab.indexOf(r); return `<tr class="${r.id === S.userTeam ? "me" : ""}"><td class="n">${k + 1}</td><td class="t">${esc(T(r.id).name)}</td><td>${r.p}</td><td>${r.gd}</td><td><b>${r.pts}</b></td></tr>`;
  }).join("")}</table>`;
}
function renderLastRound() {
  if (!S.lastMatch) return "";
  const m = S.lastMatch, h = T(m.home), a = T(m.away), mine = (m.home === S.userTeam ? m.hg - m.ag : m.ag - m.hg);
  return `<div class="card"><h3>Senaste match</h3><div class="row between"><span>${esc(h.name)}</span><b class="${mine > 0 ? "up" : mine < 0 ? "down" : ""}" style="font-size:20px">${m.hg}–${m.ag}</b><span>${esc(a.name)}</span></div>
    <div class="small muted" style="margin-top:6px">${m.events.map((e) => `${e.min}' ${esc(P(e.scorer)?.name || "")}`).join(" · ") || "Inga mål"}</div></div>`;
}
function renderNews() {
  const items = [];
  const h = (S.history || [])[0];
  if (h && S.round < 3) {
    items.push(`Förra säsongen slutade ${esc(me().name)} ${h.user?.pos}:a.`);
    if (h.retired.length) items.push(`Slutade: ${h.retired.map(esc).join(", ")}.`);
    if (h.youth.length) items.push(`Nya ungdomar i truppen: ${h.youth.map(esc).join(", ")}.`);
  }
  for (const x of (S.transfers || []).filter((x) => x.from === S.userTeam || x.to === S.userTeam).slice(0, 5))
    items.push(`${x.to === S.userTeam ? "Köpt" : "Såld"}: <b>${esc(x.name)}</b> ${x.to === S.userTeam ? "från " + esc(T(x.from).name) : "till " + esc(T(x.to).name)} för ${FM.money(x.fee)}`);
  return items.length ? `<div class="card"><h3>Nyheter</h3><ul class="news">${items.map((i) => `<li>${i}</li>`).join("")}</ul></div>` : "";
}

// ----- Trupp -----
function renderSquad() {
  const t = me(), inXI = new Set(t.lineup);
  const pl = t.players.map(P).sort((a, b) => ui.squadSort === "ovr" ? FM.ovr(b) - FM.ovr(a) : ui.squadSort === "value" ? FM.value(b) - FM.value(a) : posOrder[a.pos] - posOrder[b.pos] || FM.ovr(b) - FM.ovr(a));
  const total = pl.reduce((s, p) => s + FM.value(p), 0);
  return `<div class="row between"><h2>Trupp (${pl.length})</h2><span class="small muted">Värde ${FM.money(total)}</span></div>
    <div class="seg">${[["pos", "Position"], ["ovr", "Betyg"], ["value", "Värde"]].map(([k, l]) => `<button data-sort="${k}" class="${ui.squadSort === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="card" style="margin-top:10px;padding:8px 10px">${attrHead}<ul class="plist">${pl.map((p) => playerRow(p, `${inXI.has(p.id) ? " · <span class='gold'>start-11</span>" : ""}${p.goals ? ` · ${p.goals} mål` : ""}`)).join("")}</ul></div>
    <p class="small muted">Tryck på en spelare för att se egenskaper eller sälja. Målvakter visar MV, PAS, FYS, FAR.</p>`;
}

// ----- Taktik -----
const SLOT_POS = (formation) => {
  const [b, m, a] = FM.FORMATIONS[formation], out = [[50, 91]];
  const row = (n, y) => Array.from({ length: n }, (_, i) => [((i + 1) * 100) / (n + 1), y]);
  return [...out, ...row(b, 72), ...row(m, 47), ...row(a, 20)];
};
function renderTactic() {
  const t = me(); FM.ensureLineup(S, t);
  const sl = FM.slots(t.tactic.formation), xy = SLOT_POS(t.tactic.formation);
  const st = FM.strength(S, t);
  return `<h2>Taktik</h2>
    <div class="card"><h3>Formation</h3><div class="chips">${Object.keys(FM.FORMATIONS).map((f) => `<button class="chip ${t.tactic.formation === f ? "on" : ""}" data-form="${f}">${f}</button>`).join("")}</div>
      <h3 style="margin-top:12px">Mentalitet</h3><div class="seg">${Object.entries(FM.MENTALITY).map(([k, l]) => `<button data-ment="${k}" class="${t.tactic.mentality === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <h3 style="margin-top:12px">Press</h3><div class="seg">${Object.entries(FM.PRESS).map(([k, l]) => `<button data-press="${k}" class="${t.tactic.press === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
    <div class="card"><div class="row between"><h3>Startelva</h3><button class="chip" data-act="best11">Bästa 11</button></div>
      <div class="pitch">${sl.map((pos, i) => {
        const p = P(t.lineup[i]), [x, y] = xy[i], off = p && p.pos !== pos;
        return `<button class="slot ${off ? "off" : ""} ${ui.slotSel === i ? "sel" : ""}" data-slot="${i}" style="left:${x}%;top:${y}%">
          <div class="shirt" style="background:${t.color};color:${t.color2};border-color:${t.color2}">${p ? r1(FM.ovr(p, pos)) : "?"}</div><span class="sn">${p ? esc(p.name.split(" ").slice(-1)[0]) : pos}</span></button>`;
      }).join("")}</div>
      <p class="small muted">Tryck på en spelare på planen för att byta. Streckad ring = spelar utanför sin position (sämre betyg).</p>
      <div class="strength">${[["Anfall", st.att], ["Mittfält", st.mid], ["Försvar", st.def]].map(([l, v]) => `<span class="small muted">${l}</span><div class="bar"><span style="width:${Math.min(100, v / 20 * 100)}%;background:${acol(v)}"></span></div><b>${v.toFixed(1)}</b>`).join("")}</div></div>
    <div class="card small muted">Offensiv: fler mål framåt men sämre försvar. Defensiv: tvärtom. Hög press: bättre mittfält men lite sårbarare bakåt.</div>`;
}
function openSlot(i) {
  const t = me(), pos = FM.slots(t.tactic.formation)[i], cur = t.lineup[i];
  const cands = t.players.map(P).sort((a, b) => FM.ovr(b, pos) - FM.ovr(a, pos));
  openSheet(`<div class="row between"><h2>Välj ${FM.POS_LABEL[pos].toLowerCase()}</h2><button class="chip" data-close>Stäng</button></div>
    <ul class="plist">${cands.map((p) => { const idx = t.lineup.indexOf(p.id);
      return `<li data-swap="${p.id}" data-slot="${i}"><span class="pos ${p.pos}">${p.pos}</span>${ovrBadge(p, pos)}<div class="nm"><b>${esc(p.name)}</b><span>${p.id === cur ? "vald nu" : idx >= 0 ? "i elvan – byter plats" : "på bänken"}${p.pos !== pos ? " · fel position" : ""}</span></div>${attrCells(p)}</li>`; }).join("")}</ul>`);
}

// ----- Tabell -----
function cupRes(r) { return `<li class="${r.h === S.userTeam || r.a === S.userTeam ? "me" : ""}"><span class="h">${esc(T(r.h).name)}</span><b>${r.hg != null ? `${r.hg}–${r.ag}${r.pens ? "*" : ""}` : "–"}</b><span>${esc(T(r.a).name)}</span></li>`; }
function renderCup() {
  const c = S.cup;
  if (!c) return `<div class="card muted">Ingen Europacup den här säsongen – den startar nästa säsong. De tre bästa lagen i varje liga och den bästa fyran kvalificerar sig.</div>`;
  const ko = [["final", "Final"], ["sf", "Semifinaler"], ["qf", "Kvartsfinaler"]].filter(([k]) => c[k].length).map(([k, l]) => {
    const res = c.koResults[k];
    const rows = c[k].map(([h, a], i) => res[i] ? cupRes(res[i]) : cupRes({ h, a })).join("");
    return `<div class="card"><h3>${l}</h3><ul class="results news">${rows}</ul></div>`;
  }).join("");
  const groups = c.groups.map((g, gi) => `<div class="card"><h3>Grupp ${"ABCD"[gi]}</h3><table class="tbl"><tr><th class="t">Lag</th><th>M</th><th>+/-</th><th>P</th></tr>${FM.cupGroupTable(S, g).map((r, i) =>
    `<tr class="${r.id === S.userTeam ? "me" : ""} ${i < 2 ? "zone-cl" : ""}"><td class="t">${esc(T(r.id).name)} <span class="tiny muted">${esc(S.leagues[T(r.id).league].name)}</span></td><td>${r.p}</td><td>${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join("")}</table></div>`).join("");
  const win = c.winner ? `<div class="card center"><div style="font-size:40px">🏆</div><b style="font-size:18px">${esc(T(c.winner).name)}</b><div class="small muted">Vinnare ${S.season}/${String(S.season + 1).slice(2)}</div></div>` : "";
  return `${win}<p class="small muted">${STAGE[c.stage]} · ${FM.userInCup(S) ? `Du: <b>${FM.cupStatus(S)}</b>` : "Ditt lag är inte med i år"} · * = avgjort på straffar · två bästa i varje grupp går vidare</p>${ko}${groups}`;
}
function renderHistory() {
  const h = S.history || [];
  if (!h.length) return `<div class="card muted">Historiken fylls på när den första säsongen är slut.</div>`;
  return h.map((x) => {
    const ut = T(x.team) || me(), b = x.board;
    return `<div class="card"><div class="row between"><h3>${x.season}/${String(x.season + 1).slice(2)}</h3>${x.fired ? `<span class="small down">Sparken</span>` : ""}</div>
      <div class="row">${crest(ut)}<div><b>${esc(ut.name)} – ${x.user?.pos}:a</b><div class="small muted">${x.user?.pts} poäng · ${x.user?.gf}–${x.user?.ga}${x.userTopScorer ? ` · bäste målskytt ${esc(x.userTopScorer.name)} (${x.userTopScorer.goals})` : ""}</div></div></div>
      ${b ? `<div class="small" style="margin-top:6px">Mål: ${esc(b.text)} – <span class="${b.met ? "up" : "down"}">${b.met ? "uppnått" : "missat"}</span> · förtroende ${b.confidence}% (${b.delta >= 0 ? "+" : ""}${b.delta})${b.bonus ? ` · bonus ${FM.money(b.bonus)}` : ""}</div>` : ""}
      ${x.cup?.winner ? `<div class="small" style="margin-top:4px">🏆 Europacupen: <b>${esc(T(x.cup.winner).name)}</b>${x.cup.user ? ` · du: ${x.cup.user}` : ""}</div>` : ""}
      <table class="tbl hist" style="margin-top:8px"><tr><th class="t">Liga</th><th class="t">Mästare</th><th class="t">Skyttekung</th></tr>${Object.entries(x.champions).map(([lid, tid]) => {
        const ts = x.topScorers?.[lid];
        return `<tr><td class="t">${esc(S.leagues[lid].name)}</td><td class="t">${esc(T(tid).name)}</td><td class="t">${ts ? `${esc(ts.name)} (${ts.goals})` : ""}</td></tr>`; }).join("")}</table></div>`;
  }).join("");
}
function renderTable() {
  const lid = ui.tableLeague || me().league, L = S.leagues[lid];
  const tabs = `<div class="seg">${[["tabell", "Tabell"], ["skytte", "Skyttar"], ["resultat", "Resultat"], ["europa", "Europa"], ["historik", "Historik"]].map(([k, l]) => `<button data-ttab="${k}" class="${ui.tableTab === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const leagues = `<select class="sel" id="tableLeague">${Object.values(S.leagues).map((l) => `<option value="${l.id}" ${l.id === lid ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>`;
  let body = "";
  if (ui.tableTab === "tabell") {
    const tab = FM.sortedTable(L), n = tab.length;
    body = `<table class="tbl"><tr><th>#</th><th class="t">Lag</th><th>M</th><th>V</th><th>O</th><th>F</th><th>+/-</th><th>P</th><th>Form</th></tr>${tab.map((r, i) =>
      `<tr class="${r.id === S.userTeam ? "me" : ""} ${i < 4 ? "zone-cl" : i >= n - 3 ? "zone-rel" : ""}"><td class="n">${i + 1}</td><td class="t">${esc(T(r.id).name)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd}</td><td><b>${r.pts}</b></td><td><span class="form">${r.form.map((f) => `<i class="${f}"></i>`).join("")}</span></td></tr>`).join("")}</table>
      <p class="tiny muted">Blå = topp 4, röd = bottenplatser (ingen nedflyttning i spelet).</p>`;
  } else if (ui.tableTab === "skytte") {
    const ps = Object.values(S.players).filter((p) => p.team && T(p.team).league === lid && p.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 25);
    body = `<table class="tbl"><tr><th>#</th><th class="t">Spelare</th><th class="t">Lag</th><th>Mål</th><th>Ass</th></tr>${ps.map((p, i) =>
      `<tr class="${p.team === S.userTeam ? "me" : ""}"><td class="n">${i + 1}</td><td class="t">${esc(p.name)}</td><td class="t">${esc(T(p.team).short)}</td><td><b>${p.goals}</b></td><td>${p.assists}</td></tr>`).join("")}</table>${ps.length ? "" : `<p class="muted">Inga mål ännu.</p>`}`;
  } else if (ui.tableTab === "europa") {
    return `<h2>🏆 Europacupen</h2>${tabs}<div style="margin-top:10px">${renderCup()}</div>`;
  } else if (ui.tableTab === "historik") {
    return `<h2>Historik</h2>${tabs}<div style="margin-top:10px">${renderHistory()}</div>`;
  } else {
    const rounds = L.results.map((r, i) => [r, i]).filter(([r]) => r.length).reverse().slice(0, 6);
    const nextR = L.fixtures[S.round];
    body = (nextR ? `<h3>Omgång ${S.round + 1} (nästa)</h3><ul class="results news">${nextR.map(([h, a]) => `<li class="${h === S.userTeam || a === S.userTeam ? "me" : ""}"><span class="h">${esc(T(h).name)}</span><b>–</b><span>${esc(T(a).name)}</span></li>`).join("")}</ul>` : "") +
      rounds.map(([r, i]) => `<h3 style="margin-top:12px">Omgång ${i + 1}</h3><ul class="results news">${r.map((m) => `<li class="${m.h === S.userTeam || m.a === S.userTeam ? "me" : ""}"><span class="h">${esc(T(m.h).name)}</span><b>${m.hg}–${m.ag}</b><span>${esc(T(m.a).name)}</span></li>`).join("")}</ul>`).join("") || `<p class="muted">Inga matcher spelade ännu.</p>`;
  }
  return `<h2>${esc(L.name)}</h2>${leagues}<div style="height:8px"></div>${tabs}<div class="card" style="margin-top:10px;padding:10px">${body}</div>`;
}

// ----- Transfer -----
function renderTransfer() {
  const q = ui.tfQuery.trim().toLowerCase(), max = ui.tfMax ? +ui.tfMax * 1e6 : Infinity;
  let list = Object.values(S.players).filter((p) => p.team && p.team !== S.userTeam && (!ui.tfPos || p.pos === ui.tfPos) && (!ui.tfLeague || T(p.team).league === ui.tfLeague)
    && (!q || p.name.toLowerCase().includes(q) || T(p.team).name.toLowerCase().includes(q)) && FM.askPrice(p) <= max);
  const sorters = { ovr: (a, b) => FM.ovr(b) - FM.ovr(a), price: (a, b) => FM.askPrice(a) - FM.askPrice(b), age: (a, b) => a.age - b.age || FM.ovr(b) - FM.ovr(a), pot: (a, b) => (b.pot - FM.ovr(b)) - (a.pot - FM.ovr(a)) };
  list = list.sort(sorters[ui.tfSort]).slice(0, 60);
  return `<div class="row between"><h2>Transfermarknad</h2><span class="small">Budget <b class="gold">${FM.money(me().budget)}</b></span></div>
    <input class="search" id="tfQuery" placeholder="Sök spelare eller klubb…" value="${esc(ui.tfQuery)}">
    <div style="height:8px"></div>
    <div class="grid2"><select class="sel" id="tfLeague"><option value="">Alla ligor</option>${Object.values(S.leagues).map((l) => `<option value="${l.id}" ${ui.tfLeague === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>
      <select class="sel" id="tfMax"><option value="">Alla priser</option>${[1, 3, 5, 10, 20, 40, 80].map((v) => `<option value="${v}" ${+ui.tfMax === v ? "selected" : ""}>Max ${v} M€</option>`).join("")}<option value="${me().budget / 1e6}" ${+ui.tfMax === me().budget / 1e6 ? "selected" : ""}>Inom budget</option></select></div>
    <div style="height:8px"></div>
    <div class="seg">${[["", "Alla"], ["MV", "MV"], ["B", "Back"], ["M", "Mitt"], ["A", "Anfall"]].map(([k, l]) => `<button data-tfpos="${k}" class="${ui.tfPos === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div style="height:6px"></div>
    <div class="seg">${[["ovr", "Bäst"], ["price", "Billigast"], ["age", "Yngst"], ["pot", "Potential"]].map(([k, l]) => `<button data-tfsort="${k}" class="${ui.tfSort === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="card" style="margin-top:10px;padding:8px 10px">${attrHead}<ul class="plist">${list.map((p) => `<li data-p="${p.id}"><span class="pos ${p.pos}">${p.pos}</span>${ovrBadge(p)}<div class="nm"><b>${esc(p.name)}</b><span>${p.age} år · ${esc(T(p.team).short)} · <span class="gold">${FM.money(FM.askPrice(p))}</span></span></div>${attrCells(p)}</li>`).join("") || `<li class="muted">Inga spelare matchar.</li>`}</ul></div>`;
}

// ----- Spelarkort -----
function openPlayer(id) {
  const p = P(id), t = T(p.team), mine = p.team === S.userTeam, o = FM.ovr(p);
  const idx = p.pos === "MV" ? [6, 2, 5, 0, 1, 4] : [0, 1, 2, 3, 4, 5];
  const potTxt = p.age <= 23 ? (p.pot - o > 3 ? "Mycket stor" : p.pot - o > 1.5 ? "Stor" : p.pot - o > 0.5 ? "Viss" : "Färdigutvecklad") : p.age >= 31 ? "På väg ned" : "Färdigutvecklad";
  openSheet(`<div class="row between"><div class="row"><span class="pos ${p.pos}">${p.pos}</span>${ovrBadge(p)}<div><b style="font-size:18px">${esc(p.name)}</b><div class="small muted">${FM.POS_LABEL[p.pos]} · ${p.age} år · ${esc(t.name)}</div></div></div><button class="chip" data-close>✕</button></div>
    <div style="margin:14px 0">${idx.map((i) => `<div class="attr-row"><span class="l">${FM.ATTR_LABEL[FM.ATTRS[i]]}</span><div class="bar"><span style="width:${p.a[i] * 5}%;background:${acol(p.a[i])}"></span></div><span class="v">${p.a[i]}</span></div>`).join("")}</div>
    <div class="grid2 small"><div class="card" style="margin:0">Värde<br><b>${FM.money(FM.value(p))}</b></div><div class="card" style="margin:0">Utveckling<br><b>${potTxt}</b></div>
      <div class="card" style="margin:0">Säsongen<br><b>${p.apps} matcher · ${p.goals} mål · ${p.assists} ass</b></div><div class="card" style="margin:0">Karriär (i spelet)<br><b>${p.career.apps} m · ${p.career.goals} mål</b></div></div>
    <div style="height:12px"></div>
    ${mine ? `<button class="btn red full" data-act="sell" data-id="${p.id}">Sälj spelaren</button><div id="offerBox"></div>`
      : `<div class="small muted">Pris: <b class="gold">${FM.money(FM.askPrice(p))}</b> · Din budget: ${FM.money(me().budget)}</div><div style="height:8px"></div>
        <button class="btn green full" data-act="buy" data-id="${p.id}" ${me().budget < FM.askPrice(p) ? "disabled" : ""}>${me().budget < FM.askPrice(p) ? "Budgeten räcker inte" : "Köp för " + FM.money(FM.askPrice(p))}</button>`}`);
}
function showOffers(id) {
  const why = FM.canLeave(S, P(id));
  if (why) return toast(why);
  const offers = FM.offers(S, id);
  S._offers = { id, offers };
  $("#offerBox").innerHTML = offers.length ? `<h3 style="margin-top:14px">Bud</h3>${offers.map((o, i) => `<div class="row between card" style="margin:6px 0;padding:10px"><span>${esc(T(o.team).name)}</span><button class="btn green" data-act="accept" data-i="${i}">${FM.money(o.fee)}</button></div>`).join("")}<p class="tiny muted">Spelarens värde: ${FM.money(FM.value(P(id)))}</p>`
    : `<p class="muted small">Inga klubbar är intresserade just nu. Försök igen senare.</p>`;
}

// ----- Match -----
function playCupWithoutMe() { while (FM.cupDayPending(S) && !FM.cupUserFixture(S)) FM.playNext(S); }
function playMatch(live) {
  FM.ensureLineup(S, me());
  playCupWithoutMe();
  if (FM.seasonOver(S)) { save(); return render(); }
  const r = FM.playNext(S, { live });
  if (!r.match) { playCupWithoutMe(); save(); toast("Omgången spelad"); return render(); }
  if (!r.pending) { S.lastMatch = r.match; S.lastKind = r.kind; playCupWithoutMe(); save(); showMatchResult(r, false); return; }
  showMatchResult(r, true);
}
function roundResultsFor(r) {
  if (r.kind === "cup") {
    const c = S.cup, d = r.day;
    return d[0] === "group" ? c.mdResults[d[1]] : c.koResults[d[0]];
  }
  return S.leagues[me().league].results[S.round - 1] || [];
}
function showMatchResult(r, live) {
  const m = r.match, h = T(m.home), a = T(m.away);
  const head = r.kind === "cup" ? dayLabel(r.day) : `Omgång ${S.round + (live ? 1 : 0)}`;
  openSheet(`<div class="center"><div class="small muted">${head}</div><div class="clock" id="mClock">${live ? "0'" : "Slut"}</div>
    <div class="vs"><div class="side">${crest(h)}<span class="small">${esc(h.name)}</span></div><div class="score" id="mScore">${live ? "0–0" : esc(scoreTxt(m))}</div><div class="side">${crest(a)}<span class="small">${esc(a.name)}</span></div></div></div>
    <div class="seg" ${live ? "" : "hidden"} id="mSpeed"><button data-speed="1" class="on">Normal</button><button data-speed="3">Snabb</button><button data-speed="99">Direkt</button></div>
    <div id="mHT"></div>
    <ul class="events" id="mEvents">${live ? "" : eventsHtml(m, m.events)}</ul>
    <div id="mAfter" ${live ? "hidden" : ""}>${live ? "" : afterHtml(m, roundResultsFor(r))}</div>`, { locked: live });
  if (!live) return;
  S._locked = true;
  let min = 0, speed = 1, shown = -1;
  const draw = () => {
    const ev = m.events.filter((e) => e.min <= min);
    if (ev.length !== shown) {
      shown = ev.length;
      const hg = ev.filter((e) => e.side === "h").length;
      $("#mScore").textContent = `${hg}–${ev.length - hg}`;
      $("#mEvents").innerHTML = eventsHtml(m, ev);
    }
  };
  const step = () => {
    min++;
    draw();
    $("#mClock").textContent = `${min}'`;
    if (min === 45) { $("#mClock").textContent = "Halvtid"; $("#mSpeed").hidden = true; return halftime(); }
    if (min >= 90) {
      $("#mClock").textContent = "Slut"; $("#mScore").textContent = scoreTxt(m); $("#mSpeed").hidden = true;
      $("#mAfter").innerHTML = afterHtml(m, roundResultsFor(r)); $("#mAfter").hidden = false; S._locked = false; return;
    }
    setTimeout(step, speed >= 99 ? 0 : 70 / speed);
  };
  const halftime = () => {
    S._ht = { r, subs: 0, pick: null };
    renderHT();
  };
  S._resume = () => {
    $("#mHT").innerHTML = ""; $("#mSpeed").hidden = false;
    FM.finishPending(S);
    S.lastMatch = m; S.lastKind = r.kind; playCupWithoutMe(); save();
    delete S._ht;
    setTimeout(step, 200);
  };
  $("#mSpeed").onclick = (e) => { const v = e.target.dataset.speed; if (!v) return; speed = +v; $("#mSpeed").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target)); };
  setTimeout(step, 300);
}
const scoreTxt = (m) => `${m.hg}–${m.ag}${m.pens ? " (str.)" : ""}`;
function renderHT() {
  const t = me(), ht = S._ht, m = ht.r.match, sl = FM.slots(t.tactic.formation);
  const subsUsed = t.lineup.filter((id) => !m.htLine.includes(id)).length;
  if (ht.pick != null) {
    const pos = sl[ht.pick], out = P(t.lineup[ht.pick]);
    const bench = t.players.filter((id) => !t.lineup.includes(id)).map(P).sort((a, b) => FM.ovr(b, pos) - FM.ovr(a, pos));
    $("#mHT").innerHTML = `<div class="card ht"><div class="row between"><h3>Byt ut ${esc(out.name)}</h3><button class="chip" data-htback>Tillbaka</button></div>
      <ul class="plist">${bench.map((p) => `<li data-htin="${p.id}"><span class="pos ${p.pos}">${p.pos}</span>${ovrBadge(p, pos)}<div class="nm"><b>${esc(p.name)}</b><span>${p.pos !== pos ? "fel position" : FM.POS_LABEL[p.pos]}</span></div></li>`).join("") || `<li class="muted">Inga avbytare</li>`}</ul></div>`;
    return;
  }
  $("#mHT").innerHTML = `<div class="card ht"><h3>Halvtid – ändra laget</h3>
    <div class="small muted">Mentalitet</div><div class="seg">${Object.entries(FM.MENTALITY).map(([k, l]) => `<button data-htment="${k}" class="${t.tactic.mentality === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="small muted" style="margin-top:8px">Press</div><div class="seg">${Object.entries(FM.PRESS).map(([k, l]) => `<button data-htpress="${k}" class="${t.tactic.press === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="row between" style="margin-top:10px"><span class="small muted">Startelva – tryck för att byta</span><span class="small">Byten: <b>${subsUsed}/3</b></span></div>
    <ul class="plist">${t.lineup.map((id, i) => { const p = P(id); return `<li data-htsub="${i}"><span class="pos ${sl[i]}">${sl[i]}</span>${ovrBadge(p, sl[i])}<div class="nm"><b>${esc(p.name)}</b><span>${m.htLine.includes(id) ? "" : "inbytt"}</span></div><span class="chip">Byt</span></li>`; }).join("")}</ul>
    <button class="btn full" data-act="ht-go" style="margin-top:10px">▶ Andra halvlek</button></div>`;
}
function eventsHtml(m, evs) {
  return [...evs].reverse().map((e) => `<li class="${e.side}"><span class="m">${e.min}'</span><span>⚽ <b>${esc(P(e.scorer)?.name || "")}</b>${e.assist ? `<br><span class="small muted">ass. ${esc(P(e.assist)?.name || "")}</span>` : ""}</span></li>`).join("") || `<li class="muted">Inga mål ännu</li>`;
}
function afterHtml(m, roundRes) {
  const stat = (l, x, y, fmt = (v) => v) => `<div class="statrow"><span class="l">${fmt(x)}</span><div class="c">${l}</div><span>${fmt(y)}</span></div>`;
  const pens = m.pens ? `<p class="center gold">${esc(T(FM.winnerOf(m)).name)} vinner på straffar!</p>` : "";
  return `${pens}<div class="card" style="margin-top:12px">${stat("Bollinnehav", m.possH, 100 - m.possH, (v) => v + "%")}${stat("Skott", m.shotsH, m.shotsA)}${stat("xG", m.xgH, m.xgA, (v) => Number(v).toFixed(1))}</div>
    <h3>Övriga resultat</h3><ul class="results news">${roundRes.map((r) => `<li class="${r.h === S.userTeam || r.a === S.userTeam ? "me" : ""}"><span class="h">${esc(T(r.h).name)}</span><b>${r.hg}–${r.ag}${r.pens ? "*" : ""}</b><span>${esc(T(r.a).name)}</span></li>`).join("")}</ul>
    <div style="height:10px"></div><button class="btn full" data-close>Fortsätt</button>`;
}

// ----- Ark (modal) -----
function openSheet(html, { locked = false } = {}) { $("#sheetBody").innerHTML = html; $("#sheet").hidden = false; $("#sheet").dataset.locked = locked ? "1" : ""; }
function closeSheet() { if (S?._locked) return; $("#sheet").hidden = true; delete S?._offers; render(); }

// ---------- Händelser ----------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-job],[data-htment],[data-htpress],[data-htback],[data-htsub],[data-htin],[data-act],[data-view],[data-mode],[data-league],[data-team],[data-p],[data-draft],[data-dpos],[data-sort],[data-form],[data-ment],[data-press],[data-slot],[data-swap],[data-ttab],[data-tfpos],[data-tfsort],[data-close]");
  if (!el) return;
  const d = el.dataset;
  if (d.close !== undefined) return closeSheet();
  if (d.job) { FM.takeJob(S, d.job); delete S.jobOffers; view = "home"; save(); toast(`Välkommen till ${T(d.job).name}!`); return render(); }
  if (d.htment) { me().tactic.mentality = d.htment; return renderHT(); }
  if (d.htpress) { me().tactic.press = d.htpress; return renderHT(); }
  if (d.htback !== undefined) { S._ht.pick = null; return renderHT(); }
  if (d.htsub !== undefined) { S._ht.pick = +d.htsub; return renderHT(); }
  if (d.htin) {
    const t = me(), m = S._ht.r.match, i = S._ht.pick, prev = t.lineup[i];
    t.lineup[i] = +d.htin;
    if (t.lineup.filter((id) => !m.htLine.includes(id)).length > 3) { t.lineup[i] = prev; toast("Max 3 byten"); }
    S._ht.pick = null; return renderHT();
  }
  if (d.swap) { // byt spelare i startelvan
    const t = me(), i = +d.slot, pid = +d.swap, cur = t.lineup.indexOf(pid);
    if (cur >= 0) t.lineup[cur] = t.lineup[i];
    t.lineup[i] = pid; ui.slotSel = null; save(); $("#sheet").hidden = true; render(); return;
  }
  if (d.view) { view = d.view; window.scrollTo(0, 0); return render(); }
  if (d.mode) { setup.mode = d.mode; return render(); }
  if (d.league) { setup.league = d.league; setup.step = 3; setup.team = null; window.scrollTo(0, 0); return render(); }
  if (d.team) { setup.team = d.team; return render(); }
  if (d.draft) {
    if (FM.draftTeamOnClock(S) !== S.userTeam) return toast("Vänta på din tur");
    const p = P(+d.draft);
    if (!confirm(`Välja ${p.name} (${p.pos}, ${r1(FM.ovr(p))})?`)) return;
    const err = FM.draftPick(S, +d.draft); if (err) return toast(err);
    return draftContinue();
  }
  if (d.dpos !== undefined) { ui.draftPos = d.dpos; return render(); }
  if (d.p) return openPlayer(+d.p);
  if (d.sort) { ui.squadSort = d.sort; return render(); }
  if (d.form) { me().tactic.formation = d.form; me().lineup = FM.bestXI(S, me()); save(); return render(); }
  if (d.ment) { me().tactic.mentality = d.ment; save(); return render(); }
  if (d.press) { me().tactic.press = d.press; save(); return render(); }
  if (d.slot !== undefined && !d.swap) { ui.slotSel = +d.slot; return openSlot(+d.slot); }
  if (d.ttab) { ui.tableTab = d.ttab; return render(); }
  if (d.tfpos !== undefined) { ui.tfPos = d.tfpos; return render(); }
  if (d.tfsort) { ui.tfSort = d.tfsort; return render(); }
  switch (d.act) {
    case "continue": S = FM.migrate(load()); if (S.pending) { FM.finishPending(S); save(); } view = "home"; return render();
    case "new": if (load() && !confirm("Starta nytt spel? Det sparade spelet skrivs över.")) return; setup = { step: 1, mode: "normal" }; return render();
    case "back": setup = {}; return render();
    case "step1": setup.step = 1; return render();
    case "step2": setup.step = 2; return render();
    case "start": return startGame();
    case "draft-auto1": FM.draftAiPick(S); return draftContinue();
    case "draft-autoall": if (!confirm("Låta datorn välja resten av din trupp?")) return;
      while (!FM.draftDone(S)) FM.draftAiPick(S); return draftContinue();
    case "play": return playMatch(true);
    case "quick": return playMatch(false);
    case "ht-go": return S._resume();
    case "quick5": {
      let last, n = 0;
      while (n < 5 && !FM.seasonOver(S)) {
        FM.ensureLineup(S, me());
        const r = FM.playNext(S);
        if (r.match) { last = r.match; S.lastKind = r.kind; }
        if (r.kind === "league") n++;
      }
      playCupWithoutMe();
      if (last) S.lastMatch = last; save(); toast("5 omgångar spelade"); return render();
    }
    case "best11": me().lineup = FM.bestXI(S, me()); save(); return render();
    case "buy": { const err = FM.buy(S, +d.id); if (err) return toast(err); save(); toast(`${P(+d.id).name} är din!`); $("#sheet").hidden = true; return render(); }
    case "sell": return showOffers(+d.id);
    case "accept": { const o = S._offers.offers[+d.i], p = P(S._offers.id); const err = FM.sell(S, p.id, o); if (err) return toast(err);
      FM.ensureLineup(S, me()); save(); toast(`${p.name} såld till ${T(o.team).name} för ${FM.money(o.fee)}`); $("#sheet").hidden = true; return render(); }
    case "next-season": {
      const sum = FM.endSeason(S); if (!S.fired) me().lineup = FM.bestXI(S, me()); save(); render();
      if (!S.fired) openSheet(`<h2>Säsongen ${sum.season}/${String(sum.season + 1).slice(2)} – omdöme</h2>
        <p>${esc(T(sum.team).name)} slutade <b>${sum.user.pos}:a</b>. Styrelsens mål: ${esc(sum.board?.text || "")} – <b class="${sum.board?.met ? "up" : "down"}">${sum.board?.met ? "uppnått" : "missat"}</b>.</p>
        <p>Förtroende: <b>${sum.board?.confidence}%</b> (${sum.board?.delta >= 0 ? "+" : ""}${sum.board?.delta})${sum.board?.bonus ? ` · bonus <b class="gold">${FM.money(sum.board.bonus)}</b>` : ""}</p>
        ${sum.board?.confidence < 40 ? `<p class="down small">Styrelsen är orolig – nästa säsong måste bli bättre.</p>` : ""}
        <p class="small muted">Nytt mål för ${seasonLabel()}: <b>${esc(S.board.text)}</b>${S.board.cupTarget ? ` och minst ${S.board.cupTarget.toLowerCase()} i Europacupen` : FM.userInCup(S) ? "" : ""}.${FM.userInCup(S) ? " Ni är kvalificerade för Europacupen!" : ""}</p>
        ${sum.retired.length ? `<p class="small">Slutade: ${sum.retired.map(esc).join(", ")}</p>` : ""}${sum.youth.length ? `<p class="small">Nya ungdomar: ${sum.youth.map(esc).join(", ")}</p>` : ""}
        <button class="btn full" data-close>Kör igång säsongen</button>`);
      return;
    }
    case "menu": return openSheet(`<h2>Meny</h2><p class="small muted">Spelet sparas automatiskt efter varje händelse.</p>
      <button class="btn ghost full" data-act="to-start">Till startsidan</button><div style="height:8px"></div>
      <button class="btn red full" data-act="reset">Avsluta och radera spelet</button><div style="height:8px"></div><button class="btn full" data-close>Stäng</button>`);
    case "to-start": save(); S = null; setup = {}; $("#sheet").hidden = true; return render();
    case "reset": if (!confirm("Radera det sparade spelet?")) return; localStorage.removeItem(SAVE_KEY); S = null; setup = {}; $("#sheet").hidden = true; return render();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "tfQuery") { ui.tfQuery = e.target.value; const pos = e.target.selectionStart; render(); const i = $("#tfQuery"); i.focus(); i.setSelectionRange(pos, pos); }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "tableLeague") { ui.tableLeague = e.target.value; render(); }
  if (e.target.id === "tfLeague") { ui.tfLeague = e.target.value; render(); }
  if (e.target.id === "tfMax") { ui.tfMax = e.target.value; render(); }
});

function startGame() {
  S = FM.newGame(DATA, { mode: setup.mode, league: setup.league, team: setup.team });
  if (S.draft) { DATA_TEAM_OF = {}; S.draft.pool.forEach((id) => (DATA_TEAM_OF[id] = originalTeam(id))); S._origin = DATA_TEAM_OF; draftContinue(); }
  else { view = "home"; save(); render(); }
}
function originalTeam(id) { // ursprungligt lag räknat från datans ordning
  let n = 1; for (const L of Object.values(DATA)) for (const t of L.teams) { if (id < n + t.players.length) return t.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); n += t.players.length; }
  return null;
}
function draftContinue() {
  FM.draftAdvance(S);
  if (FM.draftDone(S)) { FM.finishDraft(S); delete S._origin; view = "squad"; save(); render(); toast("Draften är klar – här är din trupp!"); return; }
  save(); render();
}

// ---------- Start ----------
if (!Object.keys(DATA).length) document.body.innerHTML = `<div class="wrap"><h2>Spelardata saknas</h2></div>`;
else {
  const saved = load();
  if (saved?.draft && saved._origin) DATA_TEAM_OF = saved._origin;
  render();
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
