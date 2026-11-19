// Prognosmodell för Grangex-innehavet. Används både i appen (webbläsaren) och i den dagliga analysen (Node).
// Modellen är ett scenariobaserat ränta-på-ränta-antagande – INTE en förutsägelse.
// Varje scenario har en årlig kursutveckling för utvecklingsfasen (år 1–5) och en för driftsfasen (år 6+).
(function (root) {
  const HORIZONS = [0, 3, 5, 8, 12, 15, 20];

  const SCENARIOS = {
    bear: {
      name: "Bear",
      early: -25, late: -5,
      story: "Finansieringen av Sydvaranger drar ut eller misslyckas, kraftig utspädning via nyemissioner, låga järnmalmspriser. Aktien tappar större delen av sitt värde.",
    },
    base: {
      name: "Base",
      early: 12, late: 6,
      story: "Projektet finansieras men med viss utspädning och förseningar. Gruvan kommer gradvis i drift och aktien utvecklas ungefär som en stabil råvaruproducent.",
    },
    bull: {
      name: "Bull",
      early: 45, late: 10,
      story: "Finansiering och återstart går enligt plan, stark efterfrågan på högkvalitativ järnmalm för fossilfritt stål. Marknaden omvärderar bolaget från projekt till producent.",
    },
  };

  // Standardantaganden: Grangex har egna (ovan). Andra aktier får rapportens antaganden,
  // eller – om rapport saknas – generella antaganden som vidgas för volatila aktier.
  function defaultAssumptions(stockId = "grangex", volatility = null) {
    const a = {};
    if (stockId === "grangex") {
      for (const k in SCENARIOS) a[k] = { early: SCENARIOS[k].early, late: SCENARIOS[k].late, story: SCENARIOS[k].story };
      return a;
    }
    const hiVol = volatility != null && volatility > 45;
    return hiVol ? {
      bear: { early: -20, late: -3, story: "Bolaget missar sina mål, svagare marknad och eventuell utspädning. Aktien värderas ned kraftigt." },
      base: { early: 9, late: 6, story: "Verksamheten utvecklas ungefär som marknaden förväntar sig, med svängningar längs vägen." },
      bull: { early: 30, late: 10, story: "Bolaget överträffar förväntningarna och marknaden värderar upp aktien tydligt." },
    } : {
      bear: { early: -8, late: 0, story: "Svagare lönsamhet eller konjunktur, lägre värdering. Aktien står still eller faller." },
      base: { early: 7, late: 6, story: "Stabil utveckling i linje med börsens historiska snitt (inkl. återinvesterad utdelning)." },
      bull: { early: 18, late: 10, story: "Stark vinsttillväxt och högre värdering än i dag." },
    };
  }

  // Faktor som kursen multipliceras med efter `years` år.
  function factor(years, sc) {
    const e = Math.min(years, 5), l = Math.max(years - 5, 0);
    return Math.pow(1 + sc.early / 100, e) * Math.pow(1 + sc.late / 100, l);
  }

  // Räknar ut prognostabellen. Returnerar { bear: [{years, year, price, value}], base: [...], bull: [...] }
  function compute({ price, shares, assumptions, now = new Date() }) {
    const a = assumptions || defaultAssumptions();
    const out = {};
    for (const k of Object.keys(SCENARIOS)) {
      const sc = a[k] || SCENARIOS[k];
      out[k] = HORIZONS.map((y) => {
        const p = price * factor(y, sc);
        return { years: y, year: now.getFullYear() + y, price: p, value: p * shares };
      });
    }
    return out;
  }

  // Nyckeltal ur kurshistoriken: [[ms, close, volume], ...]
  function stats(history) {
    if (!history || history.length < 2) return null;
    const last = history.at(-1)[1];
    const ret = (days) => {
      const t = history.at(-1)[0] - days * 864e5;
      const p = [...history].reverse().find((h) => h[0] <= t);
      return p ? (last / p[1] - 1) * 100 : null;
    };
    const ma = (n) => history.length >= n ? history.slice(-n).reduce((s, h) => s + h[1], 0) / n : null;
    const r = history.slice(-253).map((h, i, arr) => (i ? Math.log(h[1] / arr[i - 1][1]) : null)).filter((x) => x != null && isFinite(x));
    const mean = r.reduce((s, x) => s + x, 0) / (r.length || 1);
    const vol = Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(r.length - 1, 1)) * Math.sqrt(252) * 100;
    const high52 = Math.max(...history.slice(-252).map((h) => h[1]));
    return {
      last, ret1d: ret(1), ret1w: ret(7), ret1m: ret(30), ret3m: ret(91), ret1y: ret(365),
      ma50: ma(50), ma200: ma(200), volatility: vol, fromHigh52: (last / high52 - 1) * 100,
    };
  }

  const api = { HORIZONS, SCENARIOS, defaultAssumptions, factor, compute, stats };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Forecast = api;
})(typeof self !== "undefined" ? self : this);
