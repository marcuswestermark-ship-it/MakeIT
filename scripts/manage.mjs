// Lägger till eller tar bort aktier i data/watchlist.json.
//   node scripts/manage.mjs add "<namn eller ticker>" [antal aktier]
//   node scripts/manage.mjs remove <id>
// Grangex kan aldrig tas bort.
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { avanzaSearch, avanzaInfo, slugify } from "./lib.mjs";

const FILE = new URL("../data/watchlist.json", import.meta.url);
const [, , action, query = "", sharesArg = ""] = process.argv;
const list = JSON.parse(await readFile(FILE, "utf8"));
const out = (k, v) => process.env.GITHUB_OUTPUT && appendFile(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);

if (action === "add") {
  const q = query.trim();
  if (!q) throw new Error("Ange namn eller ticker");
  const hits = await avanzaSearch(q);
  console.log("Träffar:", hits.slice(0, 8).map((h) => `${h.name} [${h.type}] ${h.ticker} #${h.avanzaId}`).join(" | "));
  const stocks = hits.filter((h) => /stock|aktie/i.test(h.type));
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const hit = stocks.find((h) => norm(h.ticker) === norm(q) || norm(h.name) === norm(q)) || stocks[0];
  if (!hit) throw new Error(`Hittade ingen aktie för "${q}"`);
  const info = await avanzaInfo(hit.avanzaId).catch(() => ({}));
  const name = info.name || hit.name;
  let id = slugify(name);
  const existing = list.find((s) => s.avanzaId === hit.avanzaId);
  if (existing) {
    if (sharesArg) existing.shares = Math.round(+sharesArg) || existing.shares;
    console.log(`${existing.name} finns redan (${existing.id})`);
    await out("id", existing.id);
  } else {
    if (list.some((s) => s.id === id)) id = `${id}-${hit.avanzaId}`;
    const first = name.split(/\s+/)[0];
    list.push({
      id, name, avanzaId: hit.avanzaId, ticker: info.ticker || hit.ticker || null, isin: info.isin || null,
      newsQuery: `"${first}"${info.ticker ? ` OR "${info.ticker}"` : ""}`, keywords: [first, ...(info.ticker ? [info.ticker] : [])],
      shares: sharesArg ? Math.round(+sharesArg) || 0 : 0, added: new Date().toISOString(),
    });
    console.log(`Lade till ${name} (${id}, Avanza #${hit.avanzaId})`);
    await out("id", id);
  }
} else if (action === "remove") {
  const s = list.find((x) => x.id === query);
  if (!s) throw new Error(`Okänd aktie: ${query}`);
  if (s.permanent) throw new Error(`${s.name} sparas alltid och kan inte tas bort`);
  list.splice(list.indexOf(s), 1);
  console.log(`Tog bort ${s.name}`);
} else if (action === "shares") {
  const s = list.find((x) => x.id === query);
  if (!s) throw new Error(`Okänd aktie: ${query}`);
  s.shares = Math.round(+sharesArg) || 0;
} else throw new Error("Okänd åtgärd");

await writeFile(FILE, JSON.stringify(list, null, 2) + "\n");
