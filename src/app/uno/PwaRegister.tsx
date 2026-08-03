"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// 서비스워커 등록 + '앱 설치' 버튼(안드로이드 크롬) / iOS 안내.
export default function PwaRegister() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 서비스워커 등록(스코프 /uno)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/uno-sw.js", { scope: "/uno" }).catch(() => {});
    }

    // 이미 설치(standalone)면 아무것도 안 함
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    try {
      if (sessionStorage.getItem("uno-install-dismissed") === "1") setDismissed(true);
    } catch {
      /* ignore */
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setDeferred(null));

    // iOS 사파리는 beforeinstallprompt 미지원 → 수동 안내
    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    if (isIOS && isSafari) setIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const close = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("uno-install-dismissed", "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (dismissed) return null;
  if (deferred) {
    return (
      <div className="uno-install">
        <span>📲 UNO를 앱으로 설치하면 홈 화면에서 바로 열려요.</span>
        <div className="uno-install-btns">
          <button className="btn sm primary" onClick={install}>
            앱 설치
          </button>
          <button className="uno-x" onClick={close} aria-label="닫기">
            ✕
          </button>
        </div>
      </div>
    );
  }
  if (iosHint) {
    return (
      <div className="uno-install">
        <span>
          📲 앱처럼 쓰려면: 하단 <strong>공유</strong> → <strong>홈 화면에 추가</strong>
        </span>
        <button className="uno-x" onClick={close} aria-label="닫기">
          ✕
        </button>
      </div>
    );
  }
  return null;
}
