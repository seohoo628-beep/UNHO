"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// 서비스워커 등록 + '앱 설치' 버튼(안드로이드/데스크톱 Chrome). 이미 설치돼 있으면 숨김.
// /uno·/fnb·/dining 은 각자 자체 PWA(별도 매니페스트·SW 스코프·설치 버튼)를 쓴다.
// 회사 플랫폼(scope /)의 SW·설치 UI 가 이 영역까지 등록되면 매장 앱 설치를 가로막으므로 비활성화한다.
export default function PWAInstall() {
  const pathname = usePathname();
  const onUno =
    (pathname?.startsWith("/uno") ||
      pathname?.startsWith("/fnb") ||
      pathname?.startsWith("/dining")) ??
    false;
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (onUno) return; // UNO 영역에서는 회사 SW 등록·설치 버튼을 비활성화(겹침 방지)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // 이미 홈 화면 앱(standalone)으로 실행 중이면 버튼 불필요
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    if (standalone) return;

    const onPrompt = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setShow(false);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [onUno]);

  if (onUno || !show) return null;

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* noop */
    }
    setDeferred(null);
    setShow(false);
  };

  return (
    <div style={{ position: "fixed", right: 14, bottom: 14, zIndex: 200, display: "flex", gap: 8 }}>
      <button
        onClick={install}
        style={{
          padding: "10px 14px",
          borderRadius: 999,
          border: "none",
          background: "var(--accent, #6366f1)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
          cursor: "pointer",
        }}
      >
        📲 앱 설치
      </button>
      <button
        onClick={() => setShow(false)}
        aria-label="닫기"
        style={{
          padding: "10px 12px",
          borderRadius: 999,
          border: "none",
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}
