// Offline support: network-first (so updates arrive immediately), cache fallback.
const CACHE = 'ironform-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icons/icon.svg', './css/app.css',
  './js/app.js', './js/store.js', './js/service.js', './js/trainer.js', './js/voice.js', './js/music.js', './js/nav.js', './js/ui/musicpicker.js',
  './js/data/exercises.js', './js/engine/calc.js', './js/engine/planner.js', './js/engine/progress.js',
  './js/engine/pep.js', './js/engine/units.js', './js/ui/dom.js', './js/ui/onboarding.js', './js/ui/home.js',
  './js/ui/player.js', './js/ui/summary.js', './js/ui/progress.js', './js/ui/library.js', './js/ui/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
