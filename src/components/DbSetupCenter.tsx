"use client";

import { useState } from "react";

export default function DbSetupCenter({
  checks,
  sql,
}: {
  checks: { table: string; label: string; ok: boolean }[];
  sql: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const missing = checks.filter((c) => !c.ok);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setShowSql(true);
    }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span className={`badge ${missing.length ? "owner" : "ok"}`}>
          {missing.length ? `${missing.length}개 미설정` : "모두 설정됨"}
        </span>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {missing.length
            ? "아래 SQL을 Supabase → SQL Editor에 붙여넣어 한 번 실행하면 모두 생성됩니다."
            : "경리·HR·운영 테이블이 모두 준비되어 있습니다."}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6, marginBottom: 12 }}>
        {checks.map((c) => (
          <div key={c.table} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ color: c.ok ? "var(--ok, #16a34a)" : "var(--owner, #b91c1c)", fontWeight: 800 }}>{c.ok ? "✓" : "✗"}</span>
            {c.label}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={copy} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>
          {copied ? "복사됨 ✓" : "전체 설정 SQL 복사"}
        </button>
        <button className="btn" onClick={() => setShowSql((v) => !v)}>{showSql ? "SQL 숨기기" : "SQL 보기"}</button>
      </div>

      {showSql && (
        <pre
          style={{
            background: "var(--ink)",
            color: "#e7e9ec",
            padding: 14,
            borderRadius: "var(--radius)",
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.5,
            marginTop: 10,
            maxHeight: 320,
          }}
        >
          {sql}
        </pre>
      )}
    </div>
  );
}
