"use client";

import { useState } from "react";

// DB 테이블이 아직 생성되지 않았을 때(마이그레이션 미적용) 안내.
export function DbSetupNotice({ title, sql }: { title: string; sql: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="card" style={{ padding: 22, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>🛠 {title} — DB 설정 필요</h2>
      <p style={{ color: "var(--ink-2)", fontSize: 14, lineHeight: 1.6 }}>
        데이터를 여러 사용자·기기가 공유하려면 Supabase에 테이블을 한 번 생성해야 합니다.
        <br />
        <b>Supabase 대시보드 → SQL Editor</b>에 아래 SQL을 붙여넣고 실행하세요. (한 번만)
      </p>
      <div style={{ position: "relative" }}>
        <button className="btn" onClick={copy} style={{ position: "absolute", top: 8, right: 8, padding: "4px 10px", fontSize: 12 }}>
          {copied ? "복사됨 ✓" : "복사"}
        </button>
        <pre
          style={{
            background: "var(--ink)",
            color: "#e7e9ec",
            padding: 16,
            borderRadius: "var(--radius)",
            overflowX: "auto",
            fontSize: 12.5,
            lineHeight: 1.5,
            margin: "8px 0 0",
          }}
        >
          {sql}
        </pre>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 0, marginTop: 12 }}>
        실행 후 이 페이지를 새로고침하면 공유 저장이 활성화됩니다. (저장소 코드: <code>supabase/migrations/0016_hr_shared.sql</code>)
      </p>
    </div>
  );
}
