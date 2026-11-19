# Aktiebevakning (Grangex)

En installerbar mobilapp (PWA) som bevakar aktier: kurs, nyheter, rapport, daglig analys och bear/base/bull-prognoser för ditt innehav.
**Grangex** (6 850 aktier) är alltid med och kan inte tas bort. Andra aktier läggs till och tas bort direkt i appen (tryck på aktiens namn högst upp).

## Flera aktier
- Listan finns i `data/watchlist.json`, data per aktie i `data/stocks/<id>.json`.
- När du lägger till en aktie i appen startar appen arbetsflödet på GitHub (`action: add`). Det söker upp aktien på Avanza, hämtar kurs, nyckeltal och nyheter, skriver en rapport med prognosantaganden och en daglig analys. Efter 2–5 minuter dyker den upp i appen.
- Appen behöver en *fine-grained token* med enbart **Actions: Read and write** för repot (anges i appen, sparas bara på telefonen).
- Från datorn går det också: Actions → *Hämta data och publicera appen* → Run workflow → `add` + namn.

- **Automatiskt (varannan timme):** aktiekurs (GRANGX.ST, 5 års historik) och nyheter från Google Nyheter (sv/no/en) och MFN. Sparas i `data/data.json`.
- **Prognos:** värdet på innehavet nu, om 3, 5, 8, 12, 15 och 20 år – alltid i tre scenarier: **Bear, Base, Bull**. Modellen (`forecast.js`) använder en årlig kursutveckling för år 1–5 och en för år 6+, som du kan ändra i appen. Knappen *Räkna ut prognos nu* hämtar senaste kursen och sparar uträkningen.
- **Daglig analys:** varje dag efter börsens stängning skapas en analys med nyckeltal (avkastning, glidande medelvärden, volatilitet), prognostabell och en text. Om GitHub-hemligheten `ANTHROPIC_API_KEY` finns skriver Claude texten, annars är den regelbaserad.
- **Manuellt:** innehav, GAV, anteckningar, händelser, länkar, nyckeltal och köp/sälj – sparas lokalt på telefonen (exportera som säkerhetskopia).

## Publicera och installera
1. GitHub → repot → **Settings → Pages → Source: GitHub Actions**.
2. (Valfritt) **Settings → Secrets and variables → Actions → New repository secret**: `ANTHROPIC_API_KEY` för AI-skrivna analyser.
3. Fliken **Actions** → *Hämta data och publicera appen* → **Run workflow** (kryssa i *Skapa en ny daglig analys direkt* första gången).
4. Öppna `https://<användarnamn>.github.io/<repo>/` i Chrome på Android → ⋮ → **Installera app**.

Prognoserna är räkneexempel baserade på antaganden – inte förutsägelser och inte investeringsrådgivning.
