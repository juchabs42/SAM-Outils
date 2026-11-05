// SAM Outils — service worker.
// Fichiers du site : réseau d'abord (toujours la dernière version en ligne),
// copie locale en secours hors connexion. Les API (Open-Meteo, Supabase…) ne sont
// pas interceptées : chaque outil gère ses propres données hors connexion.
const CACHE = 'sam-outils-v2';
const CORE = [
  './',
  './index.html',
  './config.js',
  './css/app.css',
  './js/main.js',
  './js/core/util.js',
  './js/core/auth.js',
  './js/core/places.js',
  './js/core/period.js',
  './js/core/icons.js',
  './js/core/shell.js',
  './assets/vendor/supabase-2.118.0.js',
  './assets/vendor/chart-4.4.7.umd.js',
  './assets/fonts/inter-latin-wght-normal.woff2',
  './assets/img/logo-sam-blanc.png',
  './assets/img/icon-192.png',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(CORE.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('sam-outils-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
