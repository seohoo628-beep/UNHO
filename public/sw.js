// 운호컴퍼니 운영 플랫폼 — 최소 서비스워커 (v2: 속도 우선).
// 데이터는 항상 최신이어야 하므로 캐싱하지 않는다.
// ※ 예전의 '비어 있는 fetch 핸들러'는 모든 요청(페이지 이동·저장·이미지)을 서비스워커를
//    거치게 만들어 특히 모바일(설치형 앱)에서 요청마다 수십~수백 ms 를 더 잡아먹었다.
//    fetch 핸들러를 제거하면 브라우저가 서비스워커를 건너뛰고 바로 네트워크로 간다.
//    (최신 Chrome/Android 는 설치 요건에 fetch 핸들러를 요구하지 않는다. 푸시 알림은 그대로 동작.)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // 이전 버전이 남긴 캐시가 있으면 정리
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) { /* noop */ }
      await self.clients.claim();
    })()
  )
);

// ── 웹푸시(모바일 알림) ─────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "알림", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "운호컴퍼니 알림";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { link: data.link || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ("focus" in c) {
          c.navigate(link).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
