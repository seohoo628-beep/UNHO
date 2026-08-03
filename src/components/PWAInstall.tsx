"use client";

import { useEffect, useState } from "react";

// 서비스워커 등록 + '앱 설치' 버튼(안드로이드/데스크톱 Chrome). 이미 설치돼 있으면 숨김.
export default function PWAInstall() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
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
  }, []);

  if (!show) return null;

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
