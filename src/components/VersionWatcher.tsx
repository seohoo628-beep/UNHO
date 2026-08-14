"use client";

import { useEffect, useRef } from "react";

// 배포 버전 감시기: 앱을 다시 볼 때(포그라운드 복귀)와 1분 주기로 /api/version을 확인해
// 처음 로드한 버전과 달라지면(=새 배포) 자동으로 새로고침한다.
// 입력 중이면 데이터 유실을 막기 위해 새로고침을 미룬다.
export default function VersionWatcher({ current }: { current: string }) {
  const reloading = useRef(false);

  useEffect(() => {
    if (!current || current === "dev") return;

    const isTyping = () => {
      const ae = document.activeElement as HTMLElement | null;
      return !!ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
    };

    const check = async () => {
      if (reloading.current) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { v?: string };
        if (data?.v && data.v !== current) {
          if (isTyping()) return; // 입력 중이면 다음 기회에
          reloading.current = true;
          window.location.reload();
        }
      } catch {
        /* 네트워크 오류는 무시 */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = window.setInterval(check, 60000);
    check();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(timer);
    };
  }, [current]);

  return null;
}
