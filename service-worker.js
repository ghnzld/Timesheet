/* ============================================================
   Service worker for the Log Time & Expenses mobile app.
   Caches the app shell (this HTML file + the pinned Firebase SDK
   scripts) so the page itself can open with zero connectivity.
   It never touches Firestore/Auth API traffic — that's handled by
   Firestore's own offline persistence (enablePersistence), which
   caches your data locally and queues anything you save offline
   until the connection comes back.

   Bump CACHE_VERSION whenever this file (or the precache list)
   changes, so old caches get cleaned up on the next visit.
   ============================================================ */
const CACHE_VERSION = 'v7.1-offline-1';
const CACHE_NAME = 'timesheet-shell-' + CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore-compat.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(PRECACHE_URLS.map(url =>
        cache.add(url).catch(err => console.warn('SW precache failed for', url, err))
      ))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Only the app shell (same-origin pages/assets) and the pinned Firebase
// SDK scripts are handled here. Everything else — and especially all
// Firestore/Auth API calls — passes straight through untouched.
function isShellRequest(url) {
  if (url.origin === self.location.origin) return true;
  return PRECACHE_URLS.some(u => u.startsWith('http') && u === url.href);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!isShellRequest(url)) return;

  // Page navigation: network-first, so an online visit always gets the
  // latest version and refreshes the cache; offline, it falls back to
  // whatever shell was cached at the last successful visit.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Everything else in the shell (the Firebase scripts, icons, manifest):
  // stale-while-revalidate — serve the cached copy instantly if there is
  // one, and quietly refresh it in the background when there's a network.
  event.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => null);
      return cached || networkFetch;
    })
  );
});
