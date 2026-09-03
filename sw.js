/* 마켓브리핑 Service Worker — 웹푸시 수신 + 오프라인 캐시(stale-while-revalidate)
   캐시 전략: 같은 출처의 GET(index·보고서·아이콘·manifest)과 Pretendard 폰트 CSS를
   캐시에서 먼저 응답하고 뒤에서 최신본으로 갱신한다. 보고서는 최근 40개까지만 보관.
   CACHE 이름을 바꾸면 이전 캐시는 activate 때 지워진다. */
const CACHE = 'mb-cache-v1';
const FALLBACK_URL = './index.html';
const PRECACHE = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const MAX_ENTRIES = 60;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheable(req) {
  if (req.method !== 'GET') return false;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) return true;
  return u.hostname === 'cdn.jsdelivr.net' && u.pathname.includes('pretendard');
}

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  // 오래된 것부터 삭제 (index·manifest·아이콘은 유지)
  const del = keys.filter((r) => !PRECACHE.some((p) => r.url.endsWith(p.slice(1)))).slice(0, keys.length - MAX_ENTRIES);
  await Promise.all(del.map((r) => cache.delete(r)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!cacheable(req)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        cache.put(req, res.clone()).then(() => trim(cache)).catch(() => {});
      }
      return res;
    }).catch(() => null);
    const u = new URL(req.url);
    const isIndex = req.mode === 'navigate' && (u.pathname.endsWith('/') || u.pathname.endsWith('/index.html'));
    if (isIndex) {
      // 대시보드는 네트워크 우선(최대 3초) → 실패 시 캐시 — 매일 갱신되는 화면이 한 번 늦게 보이는 일을 막는다
      const timed = new Promise((r) => setTimeout(() => r(null), 3000));
      const res = await Promise.race([network, timed]);
      if (res) return res;
      if (cached) return cached;
      return (await cache.match(FALLBACK_URL)) || Response.error();
    }
    if (cached) { network; return cached; }          // 보고서·정적 파일은 캐시 우선, 뒤에서 갱신
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match(FALLBACK_URL)) || Response.error();
    return Response.error();
  })());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: '마켓브리핑', body: event.data ? event.data.text() : '새 소식이 있어요' };
  }
  const title = data.title || '마켓브리핑';
  const options = {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: data.url || FALLBACK_URL },
    tag: data.tag || 'earnings-briefing',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || FALLBACK_URL;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
