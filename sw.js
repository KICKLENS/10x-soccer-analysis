// 10X PWA Service Worker
const CACHE_NAME = '10x-pwa-v1.0.1';
const OFFLINE_URL = '/';

// 캐시할 핵심 파일들
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-10x-clean.png',
  '/bg-stadium-field.jpg'
];

// 설치 이벤트: 핵심 파일 캐싱
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching core assets');
      return cache.addAll(CORE_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// 활성화 이벤트: 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch 이벤트: Network First, fallback to Cache
self.addEventListener('fetch', (event) => {
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  if (event.request.method !== 'GET') {
    return;
  }

  // API 요청은 캐시하지 않고 브라우저가 직접 처리(작업 상태 폴링 stale 방지)
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match(OFFLINE_URL);
        });
      })
  );
});

// 완료 알림 클릭 시 앱(영상분석 화면)으로 포커스/이동
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate('/video-analysis');
          return undefined;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/video-analysis');
      return undefined;
    })
  );
});

console.log('[SW] Service Worker loaded');
