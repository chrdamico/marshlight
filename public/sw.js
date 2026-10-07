const VERSION = 'dev';
const ASSETS = ["./app.webmanifest","./css/style.css","./fonts/fell-english-italic.woff2","./fonts/fell-english.woff2","./fonts/nunito-latin.woff2","./icons/apple-touch-icon.png","./icons/favicon-32.png","./icons/favicon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png","./index.html","./js/app.js","./js/bot.js","./js/engine.js","./js/gen.js","./js/pwa.js","./js/render.js","./js/rng.js","./js/run.js","./js/solver.js","./js/sound.js","./js/sprites.js","./js/store.js","./js/trials-data.js","./js/trials.js","./js/version.js"];
const CACHE = `marshlight-${VERSION}`;
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(['./', ...ASSETS].map((u) => cache.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('marshlight-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function fromNetwork(request) {
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') {
    const cache = await caches.open(CACHE);
    cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fromNetwork(request).catch(() => caches.match('./', { ignoreSearch: true })));
    return;
  }
  if (request.destination === 'manifest') {
    event.respondWith(fromNetwork(request).catch(() => caches.match(request, { ignoreSearch: true })));
    return;
  }
  if (DEV) {
    event.respondWith(fromNetwork(request).catch(() => caches.match(request, { ignoreSearch: true })));
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || fromNetwork(request)),
  );
});
