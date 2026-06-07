// sw.js — offline cache for static assets only. API calls always hit the network.
const CACHE = 'caribe-v7';
const ASSETS = [
  './','./index.html','./css/app.css',
  './js/app.js','./js/ui.js','./js/store.js','./js/api.js','./assets/qrcode.js',
  './manifest.webmanifest','./assets/icon.svg','./assets/inter.woff2',
  './assets/icon-192.png','./assets/icon-512.png','./assets/icon-180.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache the API — money + auth must be live.
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
