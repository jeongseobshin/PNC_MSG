/* ===========================================================================
   서비스 워커 — 앱 셸 캐시 + 웹 푸시 수신
   =========================================================================== */

const CACHE = 'teamhub-v2';
const SHELL = [
  '/', '/index.html', '/assets/css/style.css',
  '/assets/js/config.js', '/assets/js/store.js', '/assets/js/ui.js',
  '/assets/js/docs.js', '/assets/js/push.js', '/assets/js/app.js',
  '/assets/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API·인증·실시간은 캐시하지 않습니다.
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return;

  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && url.origin === location.origin) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});

/* ---------- 푸시 수신 ---------- */
self.addEventListener('push', (e) => {
  if (!e.data) return;
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'TeamHub', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(d.title || 'TeamHub', {
      body: d.body || '',
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      tag: d.tag || 'teamhub',
      renotify: !!d.urgent,
      requireInteraction: !!d.urgent,   // 긴급은 직접 닫을 때까지 남습니다
      vibrate: d.urgent ? [200, 80, 200] : [80],
      data: { url: d.url || '/' },
    })
  );
});

/* ---------- 알림 클릭 → 이미 열린 창이 있으면 그 창으로 ---------- */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(location.origin)) {
          c.postMessage({ type: 'navigate', url: target });
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
