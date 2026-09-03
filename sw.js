/* 마켓브리핑 Service Worker — 웹푸시 수신 전용 (오프라인 캐시는 사용하지 않음) */
const FALLBACK_URL = './index.html';

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
