"use client";

import { useMemo, useState, useTransition } from "react";
import { FIELDS, mapRows, type ImportKind } from "@/lib/dataImport";
import { importRows } from "@/app/(app)/data-import/actions";

const KINDS: { key: ImportKind; label: string; hint: string }[] = [
  { key: "cs", label: "CS 문의", hint: "스마트스토어·카카오채널·쿠팡 문의 내보내기를 엑셀에서 열고 머리글 포함 복사해 붙여넣으세요. 필수: 내용" },
  { key: "shipments", label: "출고 내역", hint: "택배사·3PL·스마트스토어 발송 내역. 필수: 품목(상품명). 송장번호가 같은 행은 한 번만 저장됩니다." },
  { key: "crm", label: "공구·입점 리드", hint: "셀러 시트·박람회 명단. 필수: 이름. 구분에 '바이어/입점'이 있으면 바이어로 저장됩니다." },
];

export default function DataImportForm({ today }: { today: string }) {
  const [kind, setKind] = useState<ImportKind>("cs");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const preview = useMemo(() => (text.trim() ? mapRows(kind, text, today) : null), [kind, text, today]);
  const fields = FIELDS[kind];
  const k = KINDS.find((x) => x.key === kind)!;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {KINDS.map((x) => (
          <button key={x.key} className={`btn ${kind === x.key ? "primary" : ""}`} onClick={() => { setKind(x.key); setMsg(null); }}>{x.label}</button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: "0 0 8px" }}>{k.hint}</p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setMsg(null); }}
        rows={8}
        placeholder={`${fields.map((f) => f.label).join("\t")}\n(엑셀에서 머리글 포함 복사 → 붙여넣기, CSV도 가능)`}
        style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
      />
      {preview && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12.5, marginBottom: 6 }}>
            저장 예정 <b>{preview.rows.length}</b>행{preview.skipped ? ` · 필수값 없음 ${preview.skipped}행 제외` : ""}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {fields.map((f) => (
              <span key={f.key} className={`badge ${preview.mapping[f.key] ? "ok" : f.required ? "owner" : ""}`} style={{ fontSize: 11.5 }}>
                {f.label} ← {preview.mapping[f.key] ?? "없음"}
              </span>
            ))}
          </div>
          {preview.rows.length > 0 && (
            <div style={{ overflowX: "auto", maxHeight: 220 }}>
              <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>{fields.map((f) => <th key={f.key} style={{ textAlign: "left", padding: "4px 6px", whiteSpace: "nowrap" }}>{f.label}</th>)}</tr></thead>
                <tbody>
                  {preview.rows.slice(0, 8).map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                      {fields.map((f) => <td key={f.key} style={{ padding: "4px 6px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r[f.key] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button
          className="btn primary"
          disabled={pending || !preview || preview.rows.length === 0}
          onClick={() => start(async () => {
            const r = await importRows(kind, text);
            setMsg({ ok: r.ok, text: r.message });
            if (r.ok) setText("");
          })}
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        {msg && <span style={{ fontSize: 12.5, color: msg.ok ? "var(--ok)" : "var(--owner)" }}>{msg.text}</span>}
      </div>
    </div>
  );
}
