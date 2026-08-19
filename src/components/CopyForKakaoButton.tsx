"use client";

import { useState } from "react";

// 카카오톡 등에 붙여넣기 좋은 텍스트를 클립보드로 복사하는 버튼.
// HTTPS(보안 컨텍스트)에서는 navigator.clipboard, 아니면 execCommand 폴백.
export default function CopyForKakaoButton({
  text,
  label,
  className = "btn sm",
  style,
  share = false,
}: {
  text: string | (() => string);
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  // share=true면 모바일 공유 시트(카톡 등)로 전송, 미지원 시 클립보드 복사로 폴백.
  share?: boolean;
}) {
  const [done, setDone] = useState(false);
  const defaultLabel = label ?? (share ? "📤 카톡 발송" : "📋 카톡 복사");

  const copyToClipboard = async (value: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  };

  const handle = async () => {
    const value = typeof text === "function" ? text() : text;
    try {
      const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
      if (share && nav.share) {
        try {
          await nav.share({ text: value });
          return; // 공유 시트에서 카톡 선택 → 전송
        } catch (e) {
          if ((e as { name?: string })?.name === "AbortError") return; // 사용자가 취소
          // 공유 실패 시 복사로 폴백
        }
      }
      await copyToClipboard(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      alert("전송/복사에 실패했습니다. 내용을 길게 눌러 직접 복사해 주세요.");
    }
  };

  return (
    <button type="button" className={className} style={style} onClick={handle} title={share ? "카카오톡 등으로 공유/전송" : "카카오톡 등에 붙여넣기 좋게 복사"}>
      {done ? "✅ 복사됨" : defaultLabel}
    </button>
  );
}
