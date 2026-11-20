// Spelet fungerar helt offline efter första besöket.
const CACHE = "fotboll-v2";
const FILES = ["./", "index.html", "style.css", "game.js", "ui.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "data/premier-league.js", "data/la-liga.js", "data/bundesliga.js", "data/ligue-1.js", "data/serie-a.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
