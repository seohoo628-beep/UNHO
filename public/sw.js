// 운호컴퍼니 운영 플랫폼 — 최소 서비스워커.
// 데이터는 항상 최신이어야 하므로 캐싱하지 않고 네트워크로 통과시킨다.
// (fetch 핸들러 존재 자체가 '설치형 앱' 요건을 충족한다.)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // no-op: 브라우저 기본 처리(네트워크). 오프라인 캐싱 없음 → 항상 최신 데이터.
});

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
