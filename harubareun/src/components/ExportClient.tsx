"use client";

import { useState, useTransition } from "react";
import { exportAllData, type ExportResult } from "@/app/(app)/export/actions";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function download(filename: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// 객체 배열 → CSV(중첩값은 JSON 문자열화). BOM 붙여 엑셀 한글 깨짐 방지.
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  return "﻿" + head + "\n" + body;
}

export default function ExportClient() {
  const [data, setData] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    setError(null);
    start(async () => {
      const r = await exportAllData();
      if (!r.ok) { setError(r.error ?? "실패"); return; }
      setData(r);
    });
  };

  const downloadJson = () => {
    if (!data) return;
    download(`unho-backup-${todayStr()}.json`, JSON.stringify({ generatedAt: data.generatedAt, tables: data.tables }, null, 2));
  };

  const downloadCsv = (name: string) => {
    if (!data?.tables?.[name]) return;
    download(`unho-${name}-${todayStr()}.csv`, toCsv(data.tables[name]), "text/csv");
  };

  const entries = data?.counts ? Object.entries(data.counts).sort((a, b) => a[0].localeCompare(b[0])) : [];
  const totalRows = entries.reduce((s, [, n]) => s + n, 0);

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <p style={{ marginTop: 0, fontSize: 14 }}>
          플랫폼의 모든 데이터를 <b>JSON 백업 파일</b>로 내려받거나, 표(테이블)별로 <b>CSV(엑셀)</b>로 받을 수 있습니다.
          정기적으로 받아 안전한 곳에 보관하세요.
        </p>
        <button className="btn primary" disabled={pending} onClick={run}>
          {pending ? "불러오는 중…" : data ? "🔄 다시 불러오기" : "📦 백업 데이터 불러오기"}
        </button>
        {error && <div style={{ color: "var(--owner)", fontSize: 13, marginTop: 8 }}>{error}</div>}
      </div>

      {data && (
        <>
          <div className="card" style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13.5 }}>
              총 <b>{entries.length}</b>개 테이블 · <b>{totalRows.toLocaleString()}</b>행
              <span className="muted"> · {new Date(data.generatedAt!).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 기준</span>
            </div>
            <button className="btn primary" onClick={downloadJson}>💾 전체 JSON 백업 다운로드</button>
          </div>

          <div className="section-title">테이블별 (CSV)</div>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>테이블</th><th style={{ whiteSpace: "nowrap" }}>행</th><th style={{ width: 1 }}></th></tr></thead>
              <tbody>
                {entries.map(([name, n]) => (
                  <tr key={name}>
                    <td className="mono">{name}</td>
                    <td>{n.toLocaleString()}</td>
                    <td>
                      <button className="btn sm" disabled={n === 0} onClick={() => downloadCsv(name)}>CSV</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
