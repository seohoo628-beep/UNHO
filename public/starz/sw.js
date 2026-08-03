/* STARZ PWA 서비스워커 — 앱 설치 + 오프라인 지원
   전략: 같은 출처 GET 은 네트워크 우선(최신 유지) + 실패 시 캐시(오프라인). */
const CACHE = 'starz-cache-v1';
const SHELL = [
  '/starz/',
  '/starz/index.html',
  '/starz/css/styles.css',
  '/starz/js/db.js',
  '/starz/js/app.js',
  '/starz/config.js',
  '/starz/manifest.webmanifest',
  '/starz/assets/logo.jpg',
  '/starz/assets/icon-192.png',
  '/starz/assets/icon-512.png',
  '/starz/assets/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 외부(CDN·Supabase·API)는 그대로 통과
  if (!url.pathname.startsWith('/starz/')) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/starz/index.html') : undefined))
      )
  );
});
