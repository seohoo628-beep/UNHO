"use client";

import { useState } from "react";
import type { MigrationStatus } from "@/lib/migrationCheck";

// 설정 화면 — 최근 마이그레이션(0076~) 적용 상태 + 미적용 SQL 복사.
export default function MigrationStatusCard({ statuses, pendingSql }: { statuses: MigrationStatus[]; pendingSql: string }) {
  const [copied, setCopied] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const pending = statuses.filter((s) => !s.applied);
  const allOk = pending.length === 0;

  const copy = () => {
    navigator.clipboard?.writeText(pendingSql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="card" style={{ padding: 16, borderLeft: `4px solid ${allOk ? "var(--ok,#16a34a)" : "var(--warn,#f59e0b)"}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <strong style={{ fontSize: 14.5 }}>🧩 DB 스키마 자동 점검 (0076~)</strong>
        <span className="badge" style={allOk ? { background: "var(--ok-bg,#dcfce7)", color: "var(--ok,#166534)" } : { background: "var(--warn-bg,#fef3c7)", color: "var(--warn,#b45309)" }}>
          {allOk ? "✓ 전부 적용됨" : `미적용 ${pending.length}건`}
        </span>
      </div>

      {allOk ? (
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>최근 마이그레이션이 모두 적용돼 있습니다. 새 기능이 정상 동작합니다.</p>
      ) : (
        <>
          <p style={{ fontSize: 12.5, margin: "0 0 8px", color: "var(--warn,#b45309)", fontWeight: 600 }}>
            아래 항목이 미적용 상태라 해당 기능이 저장되지 않거나 일부만 동작합니다. SQL을 복사해 Supabase → SQL Editor에서 실행해 주세요.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {pending.map((s) => (
              <div key={s.def.id} style={{ display: "flex", gap: 8, fontSize: 12.5, alignItems: "baseline" }}>
                <span className="badge" style={{ background: "var(--owner-bg,#fdecea)", color: "var(--owner,#b3261e)", fontSize: 10.5, flexShrink: 0 }}>{s.def.id}</span>
                <span style={{ fontWeight: 700, flexShrink: 0 }}>{s.def.name}</span>
                <span className="muted" style={{ minWidth: 0 }}>{s.def.feature}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm primary" onClick={copy}>{copied ? "✓ 복사됨" : "📋 미적용 SQL 전체 복사"}</button>
            <button className="btn sm" onClick={() => setShowSql((v) => !v)}>{showSql ? "SQL 접기" : "SQL 보기"}</button>
          </div>
          {showSql && (
            <pre style={{ maxHeight: 260, overflow: "auto", fontSize: 10.5, background: "var(--surface-2,#f6f7f9)", padding: "10px 12px", borderRadius: 8, margin: "10px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pendingSql}</pre>
          )}
        </>
      )}

      {/* 적용된 항목 요약(접힌 상태) */}
      <details style={{ marginTop: 10 }}>
        <summary className="muted" style={{ fontSize: 11.5, cursor: "pointer" }}>전체 점검 내역 보기 ({statuses.length}건)</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
          {statuses.map((s) => (
            <div key={s.def.id} style={{ display: "flex", gap: 6, fontSize: 12, alignItems: "baseline" }}>
              <span style={{ flexShrink: 0 }}>{s.applied ? "✅" : "❌"}</span>
              <span className="muted" style={{ flexShrink: 0 }}>{s.def.id}</span>
              <span>{s.def.name}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
