// Spelmotor för "Fotbollsmanager" – fungerar både i webbläsaren (window.FM) och i Node (för tester).
(function (root) {
  "use strict";
  const ATTRS = ["fart", "teknik", "passning", "avslut", "forsvar", "fysik", "malvakt"];
  const ATTR_LABEL = { fart: "Fart", teknik: "Teknik", passning: "Passning", avslut: "Avslut", forsvar: "Försvar", fysik: "Fysik", malvakt: "Målvakt" };
  const ATTR_SHORT = { fart: "FAR", teknik: "TEK", passning: "PAS", avslut: "AVS", forsvar: "FÖR", fysik: "FYS", malvakt: "MV" };
  const POS = ["MV", "B", "M", "A"];
  const POS_LABEL = { MV: "Målvakt", B: "Försvarare", M: "Mittfältare", A: "Anfallare" };
  const QUOTA = { MV: 2, B: 6, M: 6, A: 4 };
  // Vikter för helhetsbetyg per position (index enligt ATTRS)
  const W = {
    MV: [0.05, 0.03, 0.07, 0, 0.05, 0.05, 0.75],
    B: [0.15, 0.05, 0.12, 0.02, 0.46, 0.2, 0],
    M: [0.1, 0.3, 0.33, 0.07, 0.1, 0.1, 0],
    A: [0.2, 0.25, 0.06, 0.39, 0, 0.1, 0],
  };
  const FORMATIONS = {
    "4-4-2": [4, 4, 2], "4-3-3": [4, 3, 3], "4-5-1": [4, 5, 1], "3-5-2": [3, 5, 2],
    "3-4-3": [3, 4, 3], "5-3-2": [5, 3, 2], "5-4-1": [5, 4, 1], "4-2-4": [4, 2, 4],
  };
  const MENTALITY = { defensiv: "Defensiv", balanserad: "Balanserad", offensiv: "Offensiv" };
  const PRESS = { lag: "Låg", medel: "Medel", hog: "Hög" };
  const MIN_SQUAD = 14, MAX_SQUAD = 30;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }
  function weighted(items, wf) { const ws = items.map(wf), t = ws.reduce((s, x) => s + x, 0); let r = Math.random() * t; for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; } return items.at(-1); }

  // ---------- Betyg & värde ----------
  function ovr(p, pos = p.pos) {
    const w = W[pos]; let s = 0;
    for (let i = 0; i < 7; i++) s += p.a[i] * w[i];
    if (pos !== p.pos) s *= pos === "MV" || p.pos === "MV" ? 0.35 : 0.85; // fel position
    return s;
  }
  function value(p) {
    const o = ovr(p);
    const age = p.age <= 21 ? 1.45 : p.age <= 24 ? 1.25 : p.age <= 28 ? 1 : p.age <= 30 ? 0.75 : p.age <= 32 ? 0.45 : 0.2;
    const pot = p.pot > o + 1 ? 1 + (p.pot - o) * 0.08 : 1;
    const v = 0.5e6 * Math.pow(1.9, o - 10) * age * pot;
    return Math.max(1e5, v < 1e6 ? Math.round(v / 5e4) * 5e4 : Math.round(v / 1e5) * 1e5);
  }
  const askPrice = (p) => Math.max(1e5, Math.round(value(p) * 1.15 / 1e5) * 1e5);
  const money = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString("sv-SE", { maximumFractionDigits: 1 }) + " M€" : Math.round(v / 1e3) + " k€");

  // ---------- Världen ----------
  function slug(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  const budgetFor = (rep) => Math.round(Math.pow(2, (rep - 8) / 1.9) * 1.6e6 / 1e5) * 1e5;

  function buildWorld(DATA) {
    const s = { version: 1, leagues: {}, teams: {}, players: {}, nextId: 1 };
    for (const [lid, L] of Object.entries(DATA)) {
      s.leagues[lid] = { id: lid, name: L.name, country: L.country, teams: [] };
      for (const t of L.teams) {
        const tid = slug(t.name);
        const team = { id: tid, name: t.name, short: t.short, color: t.color, color2: t.color2, rep: t.rep, league: lid,
          budget: budgetFor(t.rep), players: [], tactic: { formation: "4-4-2", mentality: "balanserad", press: "medel" }, lineup: [] };
        for (const r of t.players) {
          const p = { id: s.nextId++, name: r[0], pos: r[1], age: r[2], a: r.slice(3, 10).map((x) => clamp(Math.round(x), 1, 20)), team: tid, goals: 0, apps: 0, assists: 0, career: { goals: 0, apps: 0 } };
          p.pot = potentialFor(p);
          s.players[p.id] = p; team.players.push(p.id);
        }
        // Lyft lag vars trupp är orimligt svag för en högstaliga (osäkra data för nykomlingar)
        const avg = team.players.reduce((x, id) => x + ovr(s.players[id]), 0) / team.players.length;
        const lift = Math.round(10.3 - avg);
        if (lift > 0) for (const id of team.players) { const p = s.players[id]; p.a = p.a.map((v, i) => (i === 6 && p.pos !== "MV" ? v : clamp(v + lift, 1, 20))); p.pot = potentialFor(p); }
        s.teams[tid] = team; s.leagues[lid].teams.push(tid);
      }
    }
    return s;
  }
  function potentialFor(p) {
    const o = ovr(p);
    const add = p.age <= 19 ? rnd(2, 5) : p.age <= 21 ? rnd(1, 4) : p.age <= 24 ? rnd(0, 2) : 0;
    return Math.min(20, o + add);
  }

  // ---------- Spelschema & tabell ----------
  function roundRobin(ids) {
    const t = [...ids]; if (t.length % 2) t.push(null);
    const n = t.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const m = [];
      for (let i = 0; i < n / 2; i++) {
        const a = t[i], b = t[n - 1 - i];
        if (a && b) m.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(m);
      t.splice(1, 0, t.pop());
    }
    return [...rounds, ...rounds.map((m) => m.map(([a, b]) => [b, a]))];
  }
  function newSeasonSchedule(s) {
    for (const L of Object.values(s.leagues)) {
      const order = [...L.teams].sort(() => Math.random() - 0.5);
      L.fixtures = roundRobin(order);
      L.results = L.fixtures.map(() => []);
      L.table = Object.fromEntries(L.teams.map((t) => [t, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }]));
    }
    s.round = 0;
    s.maxRounds = Math.max(...Object.values(s.leagues).map((L) => L.fixtures.length));
    for (const p of Object.values(s.players)) { p.goals = 0; p.apps = 0; p.assists = 0; }
  }
  function sortedTable(L) {
    return Object.entries(L.table).map(([id, r]) => ({ id, ...r, gd: r.gf - r.ga }))
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.id.localeCompare(b.id));
  }

  // ---------- Laguttagning ----------
  function slots(formation) { const [b, m, a] = FORMATIONS[formation] || FORMATIONS["4-4-2"]; return ["MV", ...Array(b).fill("B"), ...Array(m).fill("M"), ...Array(a).fill("A")]; }
  function bestXI(s, team, formation = team.tactic.formation) {
    const sl = slots(formation), used = new Set(), line = [];
    const pl = team.players.map((id) => s.players[id]);
    // Fyll först med naturliga positioner, sedan bästa övriga
    sl.forEach((pos, i) => {
      const c = pl.filter((p) => !used.has(p.id) && p.pos === pos).sort((a, b) => ovr(b) - ovr(a))[0];
      if (c) { line[i] = c.id; used.add(c.id); }
    });
    sl.forEach((pos, i) => {
      if (line[i]) return;
      const c = pl.filter((p) => !used.has(p.id)).sort((a, b) => ovr(b, pos) - ovr(a, pos))[0];
      if (c) { line[i] = c.id; used.add(c.id); }
    });
    return line;
  }
  function validLineup(s, team) {
    const sl = slots(team.tactic.formation);
    return team.lineup.length === sl.length && team.lineup.every((id) => id && s.players[id]?.team === team.id) && new Set(team.lineup).size === sl.length;
  }
  function ensureLineup(s, team) { if (!validLineup(s, team)) team.lineup = bestXI(s, team); }

  // ---------- Lagstyrka & match ----------
  function strength(s, team) {
    ensureLineup(s, team);
    const sl = slots(team.tactic.formation);
    const lp = team.lineup.map((id, i) => ({ p: s.players[id], pos: sl[i] }));
    const avg = (arr) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 6);
    const r = (x) => ovr(x.p, x.pos);
    const gk = lp.filter((x) => x.pos === "MV").map(r);
    const D = lp.filter((x) => x.pos === "B"), M = lp.filter((x) => x.pos === "M"), A = lp.filter((x) => x.pos === "A");
    const [nb, nm, na] = FORMATIONS[team.tactic.formation];
    let def = 0.32 * avg(gk) + 0.58 * avg(D.map(r)) + 0.1 * avg(M.map((x) => x.p.a[4] * (x.pos === x.p.pos ? 1 : 0.85)));
    let mid = 0.75 * avg(M.map(r)) + 0.25 * avg([...D, ...A].map((x) => x.p.a[2]));
    let att = 0.7 * avg(A.map(r)) + 0.3 * avg(M.map((x) => (x.p.a[3] + x.p.a[1]) / 2 * (x.pos === x.p.pos ? 1 : 0.85)));
    def *= 1 + 0.035 * (nb - 4); mid *= 1 + 0.03 * (nm - 4); att *= 1 + 0.05 * (na - 2);
    const m = team.tactic.mentality, pr = team.tactic.press;
    if (m === "offensiv") { att *= 1.06; def *= 0.95; } else if (m === "defensiv") { att *= 0.93; def *= 1.06; }
    if (pr === "hog") { mid *= 1.04; def *= 0.98; } else if (pr === "lag") { mid *= 0.97; def *= 1.02; }
    return { att, mid, def, lineup: lp };
  }

  function simulateMatch(s, hid, aid) {
    const H = s.teams[hid], A = s.teams[aid], sh = strength(s, H), sa = strength(s, A);
    const lam = (x, y, home) => clamp(1.13 * Math.pow(x.att / y.def, 1.45) * Math.pow(x.mid / y.mid, 0.45) * (home ? 1.1 : 0.94), 0.12, 4.5);
    const lh = lam(sh, sa, true), la = lam(sa, sh, false);
    const hg = poisson(lh), ag = poisson(la);
    const events = [];
    const scorer = (st) => weighted(st.lineup, (x) => x.p.a[3] * (x.pos === "A" ? 3 : x.pos === "M" ? 1.2 : x.pos === "B" ? 0.25 : 0.01));
    const assister = (st, sc) => weighted(st.lineup.filter((x) => x.p.id !== sc.p.id), (x) => x.p.a[2] * (x.pos === "M" ? 2 : x.pos === "A" ? 1.3 : x.pos === "B" ? 0.7 : 0.05));
    for (const [n, st, side] of [[hg, sh, "h"], [ag, sa, "a"]]) {
      for (let i = 0; i < n; i++) {
        const sc = scorer(st), as = Math.random() < 0.72 ? assister(st, sc) : null;
        events.push({ min: rint(1, 90) + (Math.random() < 0.08 ? rint(1, 5) / 10 : 0), side, scorer: sc.p.id, assist: as?.p.id || null });
      }
    }
    events.sort((x, y) => x.min - y.min);
    events.forEach((e) => (e.min = Math.floor(e.min)));
    const possH = Math.round(clamp(50 * Math.pow(sh.mid / sa.mid, 1.4) * (H.tactic.press === "hog" ? 1.03 : 1), 28, 72));
    const shotsH = hg + poisson(lh * 5.5 + 3), shotsA = ag + poisson(la * 5.5 + 3);
    return { home: hid, away: aid, hg, ag, events, possH, shotsH, shotsA, xgH: +lh.toFixed(2), xgA: +la.toFixed(2),
      lineH: sh.lineup.map((x) => x.p.id), lineA: sa.lineup.map((x) => x.p.id) };
  }

  function applyResult(s, L, res) {
    const th = L.table[res.home], ta = L.table[res.away];
    th.p++; ta.p++; th.gf += res.hg; th.ga += res.ag; ta.gf += res.ag; ta.ga += res.hg;
    const r = res.hg > res.ag ? ["V", "F"] : res.hg < res.ag ? ["F", "V"] : ["O", "O"];
    for (const [t, x] of [[th, r[0]], [ta, r[1]]]) {
      if (x === "V") { t.w++; t.pts += 3; } else if (x === "O") { t.d++; t.pts++; } else t.l++;
      t.form = [...t.form, x].slice(-5);
    }
    for (const id of [...res.lineH, ...res.lineA]) { const p = s.players[id]; p.apps++; p.career.apps++; }
    for (const e of res.events) {
      s.players[e.scorer].goals++; s.players[e.scorer].career.goals++;
      if (e.assist) s.players[e.assist].assists++;
    }
  }

  // Spelar nästa omgång i alla ligor. Returnerar användarens match (eller null om ligan är klar).
  function playRound(s) {
    let mine = null;
    for (const L of Object.values(s.leagues)) {
      if (s.round >= L.fixtures.length) continue;
      for (const [h, a] of L.fixtures[s.round]) {
        for (const t of [s.teams[h], s.teams[a]]) if (t.id !== s.userTeam) aiPrepare(s, t);
        const res = simulateMatch(s, h, a);
        L.results[s.round].push({ h, a, hg: res.hg, ag: res.ag });
        applyResult(s, L, res);
        if (h === s.userTeam || a === s.userTeam) mine = res;
      }
    }
    s.round++;
    return mine;
  }
  function aiPrepare(s, t) {
    if (!t._fmt) {
      const c = { MV: 0, B: 0, M: 0, A: 0 }; t.players.forEach((id) => c[s.players[id].pos]++);
      t.tactic.formation = c.A >= 3 && c.M >= 3 ? pick(["4-3-3", "4-4-2", "4-3-3"]) : c.B >= 5 ? pick(["5-3-2", "4-4-2"]) : "4-4-2";
      t._fmt = true;
    }
    t.lineup = bestXI(s, t);
  }
  const userFixture = (s, round = s.round) => {
    const L = s.leagues[s.teams[s.userTeam].league];
    return L.fixtures[round]?.find(([h, a]) => h === s.userTeam || a === s.userTeam) || null;
  };
  const seasonOver = (s) => s.round >= s.maxRounds;

  // ---------- Transfers ----------
  function canLeave(s, p) {
    const t = s.teams[p.team]; if (t.players.length <= MIN_SQUAD) return "Truppen blir för liten (minst " + MIN_SQUAD + ")";
    if (p.pos === "MV" && t.players.filter((id) => s.players[id].pos === "MV").length <= 1) return "Laget måste ha minst en målvakt";
    return null;
  }
  function movePlayer(s, p, toId, fee) {
    const from = s.teams[p.team], to = s.teams[toId];
    from.players = from.players.filter((id) => id !== p.id); from.lineup = from.lineup.map((id) => (id === p.id ? null : id));
    to.players.push(p.id); p.team = toId;
    from.budget += fee; to.budget -= fee;
    s.transfers = [{ season: s.season, round: s.round, pid: p.id, name: p.name, from: from.id, to: to.id, fee }, ...(s.transfers || [])].slice(0, 200);
  }
  function buy(s, pid) {
    const p = s.players[pid], me = s.teams[s.userTeam], price = askPrice(p);
    if (p.team === me.id) return "Spelaren är redan din";
    if (me.players.length >= MAX_SQUAD) return "Truppen är full (max " + MAX_SQUAD + ")";
    if (me.budget < price) return "Budgeten räcker inte";
    const why = canLeave(s, p); if (why) return why;
    movePlayer(s, p, me.id, price);
    return null;
  }
  function offers(s, pid) {
    const p = s.players[pid], v = value(p), o = ovr(p);
    const buyers = Object.values(s.teams).filter((t) => t.id !== s.userTeam && t.id !== p.team && t.players.length < MAX_SQUAD)
      .map((t) => ({ t, fit: Math.abs(t.rep - (o + 1)) + Math.random() * 3 })).sort((a, b) => a.fit - b.fit).slice(0, 6);
    return buyers.slice(0, rint(1, 3)).map(({ t }) => ({ team: t.id, fee: Math.round(v * rnd(0.75, 1.12) / 1e5) * 1e5 }))
      .filter((x) => s.teams[x.team].budget >= x.fee * 0.5).sort((a, b) => b.fee - a.fee);
  }
  function sell(s, pid, offer) {
    const p = s.players[pid]; if (p.team !== s.userTeam) return "Inte din spelare";
    const why = canLeave(s, p); if (why) return why;
    movePlayer(s, p, offer.team, offer.fee);
    return null;
  }

  // ---------- Säsongsslut ----------
  const NAMES = {
    England: [["Jack", "Harry", "Oliver", "Charlie", "George", "Alfie", "Leo", "Archie", "Ethan", "Mason", "Tyler", "Callum", "Kai", "Reece", "Jayden"], ["Smith", "Walker", "Hughes", "Turner", "Wright", "Cole", "Bennett", "Morris", "Price", "Harrison", "Brooks", "Mills", "Stone", "Carter", "Fletcher"]],
    Spanien: [["Pablo", "Hugo", "Álvaro", "Mario", "Diego", "Javi", "Iker", "Marc", "Adrián", "Sergio", "Unai", "Raúl", "Óscar", "Nico", "Dani"], ["García", "Martínez", "López", "Sánchez", "Romero", "Navarro", "Torres", "Ruiz", "Molina", "Ortega", "Delgado", "Castro", "Vidal", "Serrano", "Gil"]],
    Tyskland: [["Lukas", "Finn", "Jonas", "Leon", "Paul", "Felix", "Noah", "Elias", "Ben", "Luca", "Tim", "Nico", "Jannik", "Moritz", "Max"], ["Müller", "Schmidt", "Fischer", "Weber", "Becker", "Hoffmann", "Wagner", "Krüger", "Schulz", "Braun", "Zimmermann", "Hartmann", "Lange", "Vogel", "Koch"]],
    Frankrike: [["Lucas", "Hugo", "Théo", "Nathan", "Enzo", "Mathis", "Noah", "Louis", "Rayan", "Yanis", "Adam", "Kylian", "Malo", "Sacha", "Ilan"], ["Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Girard", "Mercier", "Fontaine", "Diallo", "Traoré", "Camara", "Lefebvre", "Rousseau", "Blanc", "Garnier"]],
    Italien: [["Lorenzo", "Matteo", "Andrea", "Luca", "Marco", "Davide", "Simone", "Federico", "Alessandro", "Riccardo", "Tommaso", "Gabriele", "Pietro", "Nicolò", "Samuele"], ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Costa"]],
  };
  function makeYouth(s, team, pos) {
    const [fn, ln] = NAMES[s.leagues[team.league].country] || NAMES.England;
    const lvl = 7 + team.rep * 0.22 + rnd(-1.5, 1.5);
    const base = { MV: [8, 7, 8, 2, 6, 9, lvl + 1], B: [lvl, lvl - 2, lvl - 1, 5, lvl + 1, lvl, 1], M: [lvl, lvl + 0.5, lvl + 1, lvl - 2, lvl - 3, lvl - 1, 1], A: [lvl + 1, lvl, lvl - 3, lvl + 1, 4, lvl - 1, 1] }[pos];
    const p = { id: s.nextId++, name: `${pick(fn)} ${pick(ln)}`, pos, age: rint(17, 19), a: base.map((x) => clamp(Math.round(x + rnd(-1.5, 1.5)), 1, 20)), team: team.id, goals: 0, apps: 0, assists: 0, career: { goals: 0, apps: 0 }, youth: true };
    p.pot = Math.min(20, ovr(p) + rnd(2, 7) + (Math.random() < 0.06 ? 3 : 0));
    s.players[p.id] = p; team.players.push(p.id);
    return p;
  }
  function develop(p) {
    const key = { MV: [6, 2, 5], B: [4, 5, 0, 2], M: [1, 2, 0, 4, 5], A: [3, 0, 1, 5] }[p.pos];
    const o = ovr(p);
    let d;
    if (p.age <= 21) d = Math.min(rnd(0.5, 2.2), Math.max(0, p.pot - o) + 0.3);
    else if (p.age <= 24) d = Math.min(rnd(0, 1.2), Math.max(0, p.pot - o) + 0.2);
    else if (p.age <= 29) d = rnd(-0.4, 0.4);
    else if (p.age <= 32) d = rnd(-1.2, 0);
    else d = rnd(-2, -0.6);
    for (let i = 0; i < 7; i++) {
      if (p.pos !== "MV" && i === 6) continue;
      const isKey = key.includes(i), phys = i === 0 || i === 5;
      let x = d * (isKey ? 1 : 0.6);
      if (p.age >= 30 && phys) x -= rnd(0, 0.8);
      p.a[i] = clamp(Math.round(p.a[i] + x + rnd(-0.35, 0.35)), 1, 20);
    }
  }
  function endSeason(s) {
    const summary = { season: s.season, champions: {}, user: null, retired: [], youth: [] };
    for (const L of Object.values(s.leagues)) {
      const tab = sortedTable(L);
      summary.champions[L.id] = tab[0].id;
      tab.forEach((r, i) => { s.teams[r.id].budget += Math.round((tab.length - i) * 1.2e6 * (s.teams[r.id].rep / 14)); });
      const ui = tab.findIndex((r) => r.id === s.userTeam);
      if (ui >= 0) summary.user = { league: L.id, pos: ui + 1, pts: tab[ui].pts };
    }
    const scorers = Object.values(s.players).sort((a, b) => b.goals - a.goals).slice(0, 5).map((p) => ({ name: p.name, team: p.team, goals: p.goals }));
    summary.topScorers = scorers;
    // Ålder, utveckling, pension
    for (const p of Object.values(s.players)) {
      p.age++; develop(p);
      const retire = p.age >= 38 || (p.age >= 35 && Math.random() < 0.45) || (p.age >= 33 && ovr(p) < 9 && Math.random() < 0.5);
      if (retire) {
        const t = s.teams[p.team];
        t.players = t.players.filter((id) => id !== p.id); t.lineup = t.lineup.map((id) => (id === p.id ? null : id));
        if (p.team === s.userTeam) summary.retired.push(p.name);
        delete s.players[p.id];
      }
    }
    // Fyll trupper med ungdomar och låt datorlag göra enkla värvningar
    for (const t of Object.values(s.teams)) {
      const c = { MV: 0, B: 0, M: 0, A: 0 }; t.players.forEach((id) => c[s.players[id].pos]++);
      for (const pos of POS) while (c[pos] < QUOTA[pos]) { const y = makeYouth(s, t, pos); c[pos]++; if (t.id === s.userTeam) summary.youth.push(y.name); }
      if (Math.random() < 0.3) { const y = makeYouth(s, t, pick(["B", "M", "A"])); if (t.id === s.userTeam) summary.youth.push(y.name); }
      if (t.id !== s.userTeam) aiTransfers(s, t);
      t._fmt = false;
    }
    s.history = [summary, ...(s.history || [])];
    s.season++;
    newSeasonSchedule(s);
    return summary;
  }
  function aiTransfers(s, t) {
    if (Math.random() > 0.55) return;
    const mine = t.players.map((id) => s.players[id]);
    const weakest = mine.filter((p) => p.pos !== "MV").sort((a, b) => ovr(a) - ovr(b))[0];
    if (!weakest) return;
    const target = Object.values(s.players).filter((p) => p.team !== t.id && p.team !== s.userTeam && p.pos === weakest.pos && ovr(p) > ovr(weakest) + 1.5
      && askPrice(p) <= t.budget * 0.6 && s.teams[p.team].rep <= t.rep && !canLeave(s, p)).sort(() => Math.random() - 0.5)[0];
    if (target) movePlayer(s, target, t.id, askPrice(target));
  }

  // ---------- Draft ----------
  function startDraft(s, leagueId) {
    const L = s.leagues[leagueId], pool = [];
    for (const tid of L.teams) { const t = s.teams[tid]; pool.push(...t.players); t.players = []; t.lineup = []; t.budget = 40e6; }
    pool.forEach((id) => (s.players[id].team = null));
    const order = [...L.teams].sort(() => Math.random() - 0.5);
    s.draft = { league: leagueId, pool, order, pick: 0, rounds: 18, log: [] };
  }
  const draftTeamOnClock = (s) => { const d = s.draft, n = d.order.length, r = Math.floor(d.pick / n), i = d.pick % n; return d.order[r % 2 ? n - 1 - i : i]; };
  const draftDone = (s) => s.draft.pick >= s.draft.rounds * s.draft.order.length;
  function needFor(s, t) { const c = { MV: 0, B: 0, M: 0, A: 0 }; t.players.forEach((id) => c[s.players[id].pos]++); return Object.fromEntries(POS.map((p) => [p, QUOTA[p] - c[p]])); }
  function draftPick(s, pid) {
    const d = s.draft, tid = draftTeamOnClock(s), t = s.teams[tid], p = s.players[pid];
    if (!d.pool.includes(pid)) return "Spelaren är redan vald";
    if (needFor(s, t)[p.pos] <= 0) return `Du har redan ${QUOTA[p.pos]} ${POS_LABEL[p.pos].toLowerCase()} – välj en annan position`;
    d.pool = d.pool.filter((x) => x !== pid); t.players.push(pid); p.team = tid;
    d.log.push({ pick: d.pick + 1, team: tid, pid }); d.pick++;
    return null;
  }
  function draftAiPick(s) {
    const t = s.teams[draftTeamOnClock(s)], need = needFor(s, t);
    const cand = s.draft.pool.map((id) => s.players[id]).filter((p) => need[p.pos] > 0)
      .map((p) => ({ p, sc: ovr(p) + (p.age <= 23 ? 0.4 : p.age >= 32 ? -0.6 : 0) + need[p.pos] * 0.15 + rnd(0, 0.8) - (p.pos === "MV" && need.MV === 1 ? 2.5 : 0) }))
      .sort((a, b) => b.sc - a.sc);
    return draftPick(s, cand[0].p.id);
  }
  // Kör datorlagens val tills det är användarens tur eller draften är klar
  function draftAdvance(s) { const out = []; while (!draftDone(s) && draftTeamOnClock(s) !== s.userTeam) { draftAiPick(s); out.push(s.draft.log.at(-1)); } return out; }
  function finishDraft(s) { for (const tid of s.leagues[s.draft.league].teams) s.teams[tid].lineup = bestXI(s, s.teams[tid]); s.draftDoneLog = s.draft.log; delete s.draft; }

  // ---------- Nytt spel ----------
  function newGame(DATA, { mode, league, team }) {
    const s = buildWorld(DATA);
    s.mode = mode; s.userTeam = team; s.season = 2026; s.created = Date.now();
    newSeasonSchedule(s);
    if (mode === "draft") startDraft(s, league);
    else s.teams[team].lineup = bestXI(s, s.teams[team]);
    return s;
  }

  const api = { ATTRS, ATTR_LABEL, ATTR_SHORT, POS, POS_LABEL, QUOTA, FORMATIONS, MENTALITY, PRESS, MIN_SQUAD, MAX_SQUAD,
    ovr, value, askPrice, money, buildWorld, newGame, slots, bestXI, validLineup, ensureLineup, strength, simulateMatch, playRound,
    userFixture, seasonOver, sortedTable, buy, offers, sell, canLeave, endSeason, startDraft, draftTeamOnClock, draftDone, draftPick,
    draftAiPick, draftAdvance, finishDraft, needFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FM = api;
})(typeof self !== "undefined" ? self : this);
