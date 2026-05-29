const CACHE_NAME = 'skillx-static-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles/main.css',
  './scripts/main.js',
  './assets/images/logo.png',
  './dist/tailwind-output.css',
  './fontawesome/css/all.min.css',
  './assets/fonts/fonts.css',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await Promise.allSettled(
        STATIC_ASSETS.map(async asset => {
          try {
            const response = await fetch(asset, { cache: 'no-cache' });
            if (!response || !response.ok) return;
            await cache.put(asset, response.clone());
          } catch (_) {
            // Ignore missing/unreachable optional assets during install.
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const destination = event.request.destination;
  const isAppShell =
    destination === 'document' ||
    destination === 'script' ||
    destination === 'style' ||
    requestUrl.pathname.endsWith('/index.html') ||
    requestUrl.pathname.endsWith('/service-worker.js');

  // Network-first for HTML/JS/CSS avoids stale UI after local edits.
  if (isAppShell) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(cached => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Cache-first for static assets like fonts/images.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      });
    })
  );
});
