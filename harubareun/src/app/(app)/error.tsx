"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { try { console.error(error); } catch { /* noop */ } }, [error]);
  return (
    <div style={{ padding: 24, maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <h2 style={{ margin: "12px 0 6px" }}>일시적인 오류가 발생했어요</h2>
      <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>페이지를 다시 불러오면 대부분 해결됩니다. 계속 반복되면 알려주세요.</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn primary" onClick={() => reset()}>다시 시도</button>
        <a className="btn" href="/hub" style={{ textDecoration: "none" }}>홈으로</a>
      </div>
    </div>
  );
}
