"use client";

import { useEffect, useState } from "react";

// 매장 플랫폼(F&B·다이닝) 전용 PWA 등록 + 설치 버튼.
//  • 서브도메인(fnb.* / dining.*)에서는 앱 scope 가 "/" 이므로 SW 도 루트("/")에 등록해야
//    start_url("/")을 제어 → 설치 요건 충족. 메인 도메인에서는 전달된 scope("/fnb/" 등)로 등록.
//  • beforeinstallprompt 를 잡아 자체 '앱 설치' 버튼을 노출(회사 앱 설치 UI 와 분리).
export default function PwaRegister({ scope }: { scope: string }) {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // 서브도메인이면 루트 스코프로 등록(앱 scope 가 "/" 이기 때문).
    const label = (window.location.hostname || "").toLowerCase().split(".")[0];
    const isSubdomain = label.includes("fnb") || label.includes("dining");
    const effectiveScope = isSubdomain ? "/" : scope;
    navigator.serviceWorker.register("/sw.js", { scope: effectiveScope }).catch(() => {});

    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    if (standalone) return;

    const onPrompt = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [scope]);

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
    <div style={{ position: "fixed", right: 14, bottom: 14, zIndex: 300, display: "flex", gap: 8 }}>
      <button
        onClick={install}
        style={{
          padding: "10px 14px",
          borderRadius: 999,
          border: "none",
          background: "var(--accent, #e8590c)",
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
