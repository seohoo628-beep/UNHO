"use client";

import { useState } from "react";

// DB 테이블이 아직 생성되지 않았을 때(마이그레이션 미적용) 안내.
// 일반 직원에게는 겁나는 SQL 대신 차분한 안내만 보이고,
// 실제 설정 SQL은 '관리자용 · 설정 SQL 보기' 토글 안에 접어 둔다.
export function DbSetupNotice({ title, sql }: { title: string; sql: string }) {
  const [copied, setCopied] = useState(false);
  const [showSql, setShowSql] = useState(false);
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
      <h2 style={{ marginTop: 0 }}>🛠 {title}</h2>
      <p style={{ color: "var(--ink-2)", fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
        이 기능은 최초 <b>한 번만</b> 관리자 설정을 마치면 바로 사용할 수 있습니다.
        <br />
        아직 설정 전이라면 대표/관리자에게 알려주세요. 설정 후 이 페이지를 새로고침하면 활성화됩니다.
      </p>

      <button
        className="btn sm"
        onClick={() => setShowSql((v) => !v)}
        style={{ marginTop: 4 }}
      >
        {showSql ? "▲ 관리자용 설정 SQL 숨기기" : "▼ 관리자용 · 설정 SQL 보기"}
      </button>

      {showSql && (
        <>
          <p className="muted" style={{ fontSize: 12.5, margin: "12px 0 6px" }}>
            <b>Supabase 대시보드 → SQL Editor</b>에 아래 SQL을 붙여넣고 실행하세요.
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
        </>
      )}
    </div>
  );
}
