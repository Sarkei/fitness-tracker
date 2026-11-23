/*
 * Service Worker: macht die App installierbar und startet sie offline schnell.
 *
 * Strategie bewusst einfach gehalten:
 *  - Navigationen: Netz zuerst (die App braucht aktuelle Daten), Fallback Cache.
 *  - Gebaute Assets (JS/CSS mit Hash im Namen): Cache zuerst, sie ändern sich nie.
 *  - API-Aufrufe: niemals cachen — Trainings- und Garmin-Daten müssen frisch sein.
 *
 * Bei einer neuen Version wird der alte Cache beim Aktivieren gelöscht.
 */
const CACHE = 'vrtx-v1';
const ASSET_CACHE = 'vrtx-assets-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html']).catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API nie cachen — sonst zeigt die App veraltete Werte.
  if (url.pathname.startsWith('/api/')) return;

  // Navigation: Netz zuerst, damit ein Deploy sofort greift.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const kopie = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', kopie)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    );
    return;
  }

  // Gehashte Assets: aus dem Cache, sonst holen und ablegen.
  if (/\.(js|css|woff2?|png|jpe?g|svg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (treffer) =>
          treffer ||
          fetch(request).then((res) => {
            if (res.ok) {
              const kopie = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(request, kopie)).catch(() => {});
            }
            return res;
          }),
      ),
    );
  }
});
