"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// 서비스워커 등록 + '앱 설치' 버튼.
// - 안드로이드/데스크톱 Chrome: beforeinstallprompt 를 잡아 네이티브 설치 프롬프트.
// - iOS Safari 등 프롬프트 미지원: 수동 설치 안내 모달.
// 이미 홈 화면 앱(standalone)으로 실행 중이면 숨긴다.
// /uno 는 자체 PWA(별도 매니페스트·SW·설치 버튼)를 쓰므로 여기선 비활성화한다.
export default function PWAInstall() {
  const pathname = usePathname();
  const onUno = (pathname?.startsWith("/uno")) ?? false;
  const [deferred, setDeferred] = useState<any>(null);
  const [standalone, setStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [guide, setGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (onUno) return; // UNO 영역에서는 회사 SW 등록·설치 버튼을 비활성화(겹침 방지)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setStandalone(!!isStandalone);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
    try { if (sessionStorage.getItem("pwaInstallDismissed") === "1") setDismissed(true); } catch { /* noop */ }

    const onPrompt = (e: any) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setStandalone(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [onUno]);

  if (onUno || standalone || dismissed) return null;

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* noop */ }
      setDeferred(null);
      return;
    }
    // 네이티브 프롬프트가 없으면(iOS 등) 수동 설치 안내
    setGuide(true);
  };

  const close = () => {
    setDismissed(true);
    try { sessionStorage.setItem("pwaInstallDismissed", "1"); } catch { /* noop */ }
  };

  return (
    <>
      <div style={{ position: "fixed", left: 12, bottom: 82, zIndex: 200, display: "flex", gap: 6, alignItems: "center" }}>
        <button
          onClick={install}
          style={{
            padding: "9px 14px",
            borderRadius: 999,
            border: "none",
            background: "var(--accent, #6366f1)",
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 800,
            boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          📲 앱 설치
        </button>
        <button
          onClick={close}
          aria-label="닫기"
          style={{
            width: 30, height: 30, borderRadius: 999, border: "none",
            background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 13, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
          }}
        >
          ✕
        </button>
      </div>

      {guide && (
        <div
          onClick={() => setGuide(false)}
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ maxWidth: 360, width: "100%", padding: 20 }}
          >
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>📲 앱 설치 방법</div>
            {isIOS ? (
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
                <li>Safari 하단의 <b>공유 버튼</b>(□↑)을 누릅니다.</li>
                <li>메뉴에서 <b>‘홈 화면에 추가’</b>를 선택합니다.</li>
                <li><b>‘추가’</b>를 누르면 홈 화면에 앱 아이콘이 생깁니다.</li>
              </ol>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
                <li>브라우저 우측 상단 <b>메뉴(⋮)</b>를 엽니다.</li>
                <li><b>‘앱 설치’</b> 또는 <b>‘홈 화면에 추가’</b>를 누릅니다.</li>
                <li>설치하면 홈 화면·앱 목록에서 바로 실행됩니다.</li>
              </ol>
            )}
            <p className="muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              설치하면 주소창 없이 앱처럼 전체화면으로 실행됩니다.
            </p>
            <button className="btn primary" style={{ marginTop: 14, width: "100%", justifyContent: "center" }} onClick={() => setGuide(false)}>
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}
