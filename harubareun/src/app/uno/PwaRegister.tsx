"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Platform = "ios" | "android" | "samsung" | "desktop";

// 서비스워커 등록 + 항상 보이는 '앱 설치' 안내(브라우저가 자동 프롬프트를 안 줘도 수동 방법 제공).
export default function PwaRegister() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(true); // 준비 전엔 숨김
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("android");

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/uno-sw.js", { scope: "/uno" }).catch(() => {});
    }

    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return; // 이미 앱으로 실행 중

    const ua = window.navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) setPlatform("ios");
    else if (/samsungbrowser/i.test(ua)) setPlatform("samsung");
    else if (/android/i.test(ua)) setPlatform("android");
    else setPlatform("desktop");

    let hidden = false;
    try {
      hidden = sessionStorage.getItem("uno-install-dismissed") === "1";
    } catch {
      /* ignore */
    }
    setDismissed(hidden);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setDismissed(true));
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

  const primary = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return;
    }
    setOpen((v) => !v);
  };

  if (dismissed) return null;

  const steps: Record<Platform, string> = {
    ios: "사파리 하단 가운데 공유 버튼( ⬆️ )을 누른 뒤 → “홈 화면에 추가”를 선택하세요.",
    android: "크롬 오른쪽 위 메뉴( ⋮ )를 누른 뒤 → “앱 설치” 또는 “홈 화면에 추가”를 선택하세요.",
    samsung: "삼성 인터넷 하단 메뉴( ≡ )를 누른 뒤 → “현재 페이지 추가” → “홈 화면”을 선택하세요.",
    desktop: "주소창 오른쪽의 설치 아이콘( ⊕ ), 또는 브라우저 메뉴 → “앱 설치”를 누르세요.",
  };

  return (
    <div className="uno-install">
      <div className="uno-install-main">
        <div className="uno-install-row">
          <span>📲 UNO를 앱으로 설치하면 홈 화면에서 바로 열려요.</span>
          <div className="uno-install-btns">
            <button className="btn sm primary" onClick={primary}>
              {deferred ? "앱 설치" : "설치 방법"}
            </button>
            <button className="uno-x" onClick={close} aria-label="닫기">
              ✕
            </button>
          </div>
        </div>
        {open && !deferred && <div className="uno-install-help">{steps[platform]}</div>}
      </div>
    </div>
  );
}
