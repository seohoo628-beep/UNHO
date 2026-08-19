"use client";

import { useState } from "react";

// 카카오톡 등에 붙여넣기 좋은 텍스트를 클립보드로 복사하는 버튼.
// HTTPS(보안 컨텍스트)에서는 navigator.clipboard, 아니면 execCommand 폴백.
export default function CopyForKakaoButton({
  text,
  label = "📋 카톡 복사",
  className = "btn sm",
  style,
}: {
  text: string | (() => string);
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [done, setDone] = useState(false);

  const copy = async () => {
    const value = typeof text === "function" ? text() : text;
    try {
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
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      alert("복사에 실패했습니다. 내용을 길게 눌러 직접 복사해 주세요.");
    }
  };

  return (
    <button type="button" className={className} style={style} onClick={copy} title="카카오톡 등에 붙여넣기 좋게 복사">
      {done ? "✅ 복사됨" : label}
    </button>
  );
}
