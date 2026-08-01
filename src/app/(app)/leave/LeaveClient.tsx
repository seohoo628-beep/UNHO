"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { createLeave, updateLeave, setLeaveStatus, deleteLeave, type LeaveInput } from "./actions";

export interface Leave extends LeaveInput {
  id: string;
}

const TYPES = ["연차", "반차", "병가", "경조사", "기타"];
const STATUSES = ["신청", "승인", "반려"];
const DEFAULT_QUOTA = 15;

const SETUP_SQL = `create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default '연차' check (type in ('연차','반차','병가','경조사','기타')),
  start_date date not null, end_date date,
  days numeric not null default 1, reason text,
  status text not null default '신청' check (status in ('신청','승인','반려')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.leave_requests enable row level security;
create policy leave_requests_all on public.leave_requests
  for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const today = () => new Date().toISOString().slice(0, 10);

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};

export default function LeaveClient({ rows, dbReady }: { rows: Leave[]; dbReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Leave | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) setErr(r.error ?? "오류가 발생했습니다.");
      else {
        setErr("");
        router.refresh();
      }
    });

  const summary = useMemo(() => {
    const m: Record<string, { used: number; pending: number }> = {};
    for (const l of rows) {
      if (!l.name) continue;
      m[l.name] ??= { used: 0, pending: 0 };
      if (l.status === "승인") m[l.name].used += l.days;
      else if (l.status === "신청") m[l.name].pending += l.days;
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const list = useMemo(
    () => rows.filter((l) => !q || (l.name + l.type + l.reason).toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );

  if (!dbReady) {
    return (
      <>
        <div className="page-head"><h1 style={{ margin: 0 }}>🌴 연차관리</h1></div>
        <DbSetupNotice title="연차관리" sql={SETUP_SQL} />
      </>
    );
  }

  return (
    <>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🌴 연차관리</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            직원 누구나 직접 신청 · 기본 연차 {DEFAULT_QUOTA}일 · <span style={{ color: "var(--ok)" }}>DB 공유</span>
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
        <button className="btn" onClick={() => { setEdit(null); setOpen(true); }} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 연차 신청</button>
      </div>

      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner)", background: "var(--owner-bg)" }}>{err}</div>}

      {summary.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {summary.map(([name, v]) => (
            <div key={name} style={{ minWidth: 150, border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "8px 12px" }}>
              <div style={{ fontWeight: 700 }}>{name}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                사용 {v.used}일 · 잔여 <b style={{ color: "var(--ok)" }}>{Math.max(0, DEFAULT_QUOTA - v.used)}일</b>
                {v.pending ? ` · 신청중 ${v.pending}일` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·유형·사유 검색…" style={{ ...inputStyle, maxWidth: 280 }} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 780 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
              <th style={th}>직원</th>
              <th style={th}>유형</th>
              <th style={th}>기간</th>
              <th style={{ ...th, textAlign: "right" }}>일수</th>
              <th style={th}>사유</th>
              <th style={th}>상태</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ padding: 24, textAlign: "center" }}>신청 내역이 없습니다. ‘+ 연차 신청’으로 등록하세요.</td></tr>
            )}
            {list.map((l) => (
              <tr key={l.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ ...td, fontWeight: 600 }}>{l.name}</td>
                <td style={td}><span className="badge">{l.type}</span></td>
                <td style={td}>{l.start}{l.end && l.end !== l.start ? ` ~ ${l.end}` : ""}</td>
                <td style={{ ...td, textAlign: "right" }}>{l.days}일</td>
                <td style={{ ...td, color: "var(--ink-2)", maxWidth: 240 }}>{l.reason || "-"}</td>
                <td style={td}>
                  <select value={l.status} disabled={pending} onChange={(e) => run(setLeaveStatus(l.id, e.target.value))} style={{ padding: "4px 8px", border: "1px solid var(--line-2)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)", fontSize: 12.5 }}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button className="btn" style={smBtn} onClick={() => { setEdit(l); setOpen(true); }}>수정</button>{" "}
                  <button className="btn" style={{ ...smBtn, color: "var(--owner)" }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deleteLeave(l.id)); }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <LeaveModal
          initial={edit}
          pending={pending}
          onClose={() => setOpen(false)}
          onSave={(l) => {
            const { id, ...inp } = l;
            run(id ? updateLeave(id, inp) : createLeave(inp));
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function daysBetween(a: string, b: string): number {
  if (!a) return 0;
  if (!b || b === a) return 1;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  return d >= 0 ? d + 1 : 1;
}

function LeaveModal({ initial, pending, onClose, onSave }: { initial: Leave | null; pending: boolean; onClose: () => void; onSave: (l: Leave) => void }) {
  const [f, setF] = useState<Leave>(
    initial ?? { id: "", name: "", type: "연차", start: today(), end: today(), days: 1, reason: "", status: "신청" }
  );
  const set = (k: keyof Leave, v: any) => setF((p) => ({ ...p, [k]: v }));
  const applyDates = (startD: string, endD: string, type: string) => {
    setF((p) => ({ ...p, start: startD, end: endD, type, days: type === "반차" ? 0.5 : daysBetween(startD, endD) }));
  };

  return (
    <div onMouseDown={onClose} style={backdrop}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "연차 수정" : "연차 신청"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="직원명"><input style={inputStyle} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="유형">
            <select style={inputStyle} value={f.type} onChange={(e) => applyDates(f.start, f.end, e.target.value)}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="시작일"><input type="date" style={inputStyle} value={f.start} onChange={(e) => applyDates(e.target.value, f.end, f.type)} /></Field>
          <Field label="종료일"><input type="date" style={inputStyle} value={f.end} onChange={(e) => applyDates(f.start, e.target.value, f.type)} /></Field>
          <Field label="일수"><input type="number" step="0.5" style={inputStyle} value={f.days} onChange={(e) => set("days", Number(e.target.value))} /></Field>
          <Field label="상태">
            <select style={inputStyle} value={f.status} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="사유"><input style={inputStyle} value={f.reason} onChange={(e) => set("reason", e.target.value)} /></Field>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn" disabled={!f.name.trim() || pending} onClick={() => onSave(f)} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>저장</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700 };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
const smBtn: React.CSSProperties = { padding: "3px 9px", fontSize: 12 };
const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 };
