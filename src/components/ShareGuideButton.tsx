"use client";

import { useState } from "react";

// 플랫폼 사용법을 카톡 등으로 전달. 모바일은 공유 시트(카카오톡 포함),
// 미지원 환경은 링크 복사 후 카카오톡 열기.
export default function ShareGuideButton({ summary }: { summary: string }) {
  const [hint, setHint] = useState<string | null>(null);

  const share = async () => {
    setHint(null);
    const url = typeof window !== "undefined" ? window.location.origin + "/guide" : "";
    const text = `운호컴퍼니 운영 플랫폼 사용법\n${url}\n\n${summary}`;
    const nav = navigator as any;
    try {
      if (nav.share) {
        await nav.share({ title: "운호컴퍼니 플랫폼 사용법", text: summary, url });
        return;
      }
    } catch (e: any) {
      if (e && e.name === "AbortError") return; // 사용자가 닫음
    }
    // 미지원 → 링크·요약 복사 후 카카오톡 열기
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    try { window.location.href = "kakaotalk://"; } catch { /* ignore */ }
    setHint("📋 사용법 링크가 복사됐어요. 카카오톡 대화창에 붙여넣어 전달하세요.");
    setTimeout(() => setHint(null), 8000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <button
        onClick={share}
        className="btn"
        style={{ background: "#fee500", borderColor: "#fee500", color: "#3c1e1e", fontWeight: 700, whiteSpace: "nowrap" }}
      >
        🟡 카톡으로 전달
      </button>
      {hint && <span style={{ fontSize: 12, color: "#92400e", background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: "6px 8px" }}>{hint}</span>}
    </div>
  );
}
