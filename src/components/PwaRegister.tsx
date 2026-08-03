"use client";

import { useEffect } from "react";

// 플랫폼별 스코프로 서비스워커 등록 → '홈 화면에 추가' 시 앱처럼 동작.
export default function PwaRegister({ scope }: { scope: string }) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope }).catch(() => {});
  }, [scope]);
  return null;
}
