// UNO 앱 서비스워커 — 설치 가능 + 오프라인 시 마지막 화면 폴백.
// 네비게이션은 네트워크 우선, 실패 시 캐시된 /uno 를 보여준다. 그 외 요청은 통과.
const CACHE = "uno-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("/uno", copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match("/uno").then((r) => r || Response.error())),
  );
});
