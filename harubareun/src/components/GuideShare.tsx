"use client";

import { useState } from "react";

// 카톡으로 전달: 모바일은 공유 시트(카카오톡 포함), 미지원 환경은 클립보드 복사.
export default function GuideShare({ text, title }: { text: string; title: string }) {
  const [msg, setMsg] = useState<string | null>(null);

  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title, text });
        return;
      } catch {
        /* 사용자가 취소했거나 미지원 → 복사 폴백 */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setMsg("복사됨 · 카톡에 붙여넣기 하세요");
    setTimeout(() => setMsg(null), 2500);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button className="btn" onClick={share} style={{ fontWeight: 700 }}>💬 카톡으로 전달</button>
      {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
    </div>
  );
}
