const CACHE = 'banjara-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: always try the network, fall back to cache when offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Don't intercept Supabase API calls — let them fail normally when offline
  if (e.request.url.includes('supabase.co')) return;

  // Only cache same-origin requests (the app shell)
  if (new URL(e.request.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
