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


  // ================= UTDELNING =================
  // Grangex: utdelningen räknas fram ur Sydvarangers kassaflöde (förenklad gruvmodell).
  //   Produktion (Mt/år, upprampning 60 % år 1, 90 % år 2, fas 2 från produktionsår 5)
  //   × (pris − kassakostnad, USD/t) = EBITDA
  //   − underhållsinvesteringar − skuldtjänst (räntor + amortering, under X år) − fas 2-investering (år 3–4)
  //   = fritt kassaflöde → × (1 − bolagsskatt) × utdelningsandel = total utdelning (MUSD)
  //   Utdelning per aktie (kr) = total utdelning × USD/SEK ÷ antal aktier efter finansiering (miljoner)
  //   Utdelningen betalas året efter vinståret.
  // Källor för grundvärden: Grangex DFS (sep 2025): 2,5 Mt/år fas 1, 3–3,5 Mt/år fas 2, 70 % Fe,
  // kassakostnad ca 56 USD/t, fas 1-capex 194 MUSD, fas 2-capex 224 MUSD; finansieringsbehov ca 300 MUSD (lån + nyemission).
  const GRANGEX_DIVIDEND = {
    bear: { startYear: 2030, mt1: 2.2, mt2: 2.2, price: 110, cost: 65, sustain: 15, debtService: 45, debtYears: 8, phase2Capex: 0,   tax: 22, payout: 30, sharesM: 180, fx: 10 },
    base: { startYear: 2028, mt1: 2.5, mt2: 3.0, price: 125, cost: 58, sustain: 15, debtService: 45, debtYears: 7, phase2Capex: 224, tax: 22, payout: 50, sharesM: 90,  fx: 10 },
    bull: { startYear: 2027, mt1: 2.5, mt2: 3.3, price: 140, cost: 55, sustain: 12, debtService: 40, debtYears: 6, phase2Capex: 224, tax: 22, payout: 60, sharesM: 55,  fx: 10 },
  };
  const GRANGEX_PARAM_LABELS = {
    startYear: "Produktionsstart (år)", mt1: "Produktion fas 1 (Mt/år)", mt2: "Produktion fas 2 (Mt/år)", price: "Pris koncentrat (USD/t)",
    cost: "Kassakostnad (USD/t)", sustain: "Underhållsinvest. (MUSD/år)", debtService: "Skuldtjänst (MUSD/år)", debtYears: "Skuldtjänst antal år",
    phase2Capex: "Fas 2-investering (MUSD)", tax: "Bolagsskatt (%)", payout: "Utdelningsandel (%)", sharesM: "Aktier efter finansiering (milj.)", fx: "USD/SEK",
  };

  // Andra aktier: dagens utdelning per aktie som växer med en årlig takt per scenario.
  const SIMPLE_DIVIDEND = { bear: { growth: 0 }, base: { growth: 4 }, bull: { growth: 8 } };

  // Standardfördelning av utdelningen (andelar i %)
  // ISK: ingen skatt på utdelningen, i stället schablonskatt på kontots värde över ett skattefritt belopp.
  // 2026: 1,065 % (30 % × (statslåneränta 2,55 % + 1 %)) på kapital över 300 000 kr.
  const DEFAULT_ALLOCATION = { google: 30, investor: 20, cash: 45, reinvest: 5, tax: 0, googleReturn: 9, investorReturn: 8, cashRate: 0, iskRate: 1.065, iskFree: 300000 };

  // Utdelning per aktie (kr) som betalas ut ett visst kalenderår, Grangex-modellen.
  function grangexDps(year, p) {
    const y = year - p.startYear; // produktionsår (1 = första) för vinståret year-1
    if (y < 1) return 0;
    const ramp = y === 1 ? 0.6 : y === 2 ? 0.9 : 1;
    const q = (y >= 5 ? p.mt2 : p.mt1) * ramp;
    const ebitda = q * (p.price - p.cost);
    const fcf = ebitda - p.sustain - (y <= p.debtYears ? p.debtService : 0) - (y === 3 || y === 4 ? p.phase2Capex / 2 : 0);
    if (fcf <= 0) return 0;
    const dividendMusd = fcf * (1 - p.tax / 100) * (p.payout / 100);
    return (dividendMusd * p.fx) / p.sharesM;
  }

  // Simulerar 20 år: utdelning, fördelning och återinvestering.
  //   opts: { stockId, shares, price, priceAssumptions, divParams, currentDps, allocation, startYear }
  function dividendPlan(opts) {
    const a = { ...DEFAULT_ALLOCATION, ...(opts.allocation || {}) };
    const now = opts.startYear || new Date().getFullYear();
    const out = {};
    for (const k of ["bear", "base", "bull"]) {
      const sc = opts.priceAssumptions?.[k] || { early: 0, late: 0 };
      const dp = opts.divParams?.[k] || (opts.stockId === "grangex" ? GRANGEX_DIVIDEND[k] : SIMPLE_DIVIDEND[k]);
      let shares = opts.shares, google = 0, investor = 0, cash = 0, firstYear = null, totalNet = 0, iskTotal = 0;
      const years = [];
      for (let i = 1; i <= 20; i++) {
        const year = now + i;
        const dps = opts.stockId === "grangex" ? grangexDps(year, dp) : (opts.currentDps || 0) * Math.pow(1 + dp.growth / 100, i - 1);
        const gross = dps * shares;
        const net = gross * (1 - a.tax / 100);
        const price = opts.price * factor(i, sc);
        google = google * (1 + a.googleReturn / 100) + net * a.google / 100;
        investor = investor * (1 + a.investorReturn / 100) + net * a.investor / 100;
        cash = cash * (1 + a.cashRate / 100) + net * a.cash / 100;
        const bought = price > 0 ? (net * a.reinvest / 100) / price : 0;
        shares += bought;
        totalNet += net;
        // ISK-schablonskatt på kontots värde (aktien + Google + Investor) över skattefritt belopp; betalas från kontantuttaget.
        const iskBase = shares * price + google + investor;
        const iskTax = Math.max(0, iskBase - (a.iskFree || 0)) * (a.iskRate || 0) / 100;
        cash -= iskTax; iskTotal += iskTax;
        if (net > 0 && firstYear == null) firstYear = year;
        years.push({ i, year, dps, shares, gross, net, toGoogle: net * a.google / 100, toInvestor: net * a.investor / 100, toCash: net * a.cash / 100,
          toReinvest: net * a.reinvest / 100, bought, price, google, investor, cash, holding: shares * price, iskBase, iskTax });
      }
      out[k] = { years, firstYear, totalNet, iskTotal, params: dp };
    }
    return out;
  }

  const api = { HORIZONS, SCENARIOS, defaultAssumptions, factor, compute, stats, GRANGEX_DIVIDEND, GRANGEX_PARAM_LABELS, SIMPLE_DIVIDEND, DEFAULT_ALLOCATION, grangexDps, dividendPlan };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Forecast = api;
})(typeof self !== "undefined" ? self : this);
