var CACHE_NAME = 'wedding-v1';
var STATIC_URLS = [
  '/',
  '/config.js',
  '/manifest.json',
  '/assets/favicon.svg',
];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(STATIC_URLS); }));
});

self.addEventListener('fetch', function(e) {
  // Network first for API, cache first for static
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(function() { return caches.match(e.request); }));
  } else {
    e.respondWith(caches.match(e.request).then(function(r) { return r || fetch(e.request); }));
  }
});
