# Grangex Bevakning

En installerbar mobilapp (PWA) som samlar information om Grangex och Sydvaranger-gruvan.

- **Automatiskt:** aktiekurs (GRANGX.ST, 5 års historik) och nyheter från Google Nyheter (sv/no/en) och MFN-pressmeddelanden. Hämtas varannan timme av GitHub Actions (`scripts/fetch-data.mjs`) och sparas i `data/data.json`, så nyhetsarkivet växer över tid.
- **Manuellt:** innehav (antal aktier, GAV), anteckningar, händelser, länkar, nyckeltal och köp/sälj. Sparas lokalt på telefonen; exportera/importera som JSON-säkerhetskopia.

## Publicera och installera
1. GitHub → repot → **Settings → Pages → Source: GitHub Actions**.
2. Kör arbetsflödet *Hämta data och publicera appen* (fliken Actions → Run workflow).
3. Öppna sidans adress (`https://<användarnamn>.github.io/<repo>/`) i Chrome på Android → meny ⋮ → **Installera app** (eller knappen *Installera* i appen).

Ingen investeringsrådgivning.
