"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { createEmp, updateEmp, deleteEmp, type EmpInput } from "./actions";

export interface Emp extends EmpInput {
  id: string;
}

const SETUP_SQL = `create table if not exists public.staff_directory (
  id uuid primary key default gen_random_uuid(),
  name text not null, position text, hire_date date,
  salary bigint default 0, phone text, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff_directory enable row level security;
create policy staff_directory_all on public.staff_directory
  for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const won = (n: number) => (n ? n.toLocaleString("ko-KR") + "원" : "-");
const emptyEmp = (): Emp => ({ id: "", name: "", position: "", hireDate: "", salary: 0, phone: "", note: "" });

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};

export default function StaffClient({ rows, dbReady }: { rows: Emp[]; dbReady: boolean }) {
  return dbReady ? (
    <Board rows={rows} />
  ) : (
    <>
      <div className="page-head">
        <h1 style={{ margin: 0 }}>직원관리</h1>
      </div>
      <DbSetupNotice title="직원관리" sql={SETUP_SQL} />
    </>
  );
}

function Board({ rows }: { rows: Emp[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Emp | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const list = useMemo(
    () => rows.filter((e) => !q || (e.name + e.position + e.phone + e.note).toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );
  const payroll = rows.reduce((s, e) => s + (e.salary || 0), 0);

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) setErr(r.error ?? "오류가 발생했습니다.");
      else {
        setErr("");
        router.refresh();
      }
    });

  return (
    <>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🔒 직원관리</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            총 {rows.length}명 · 연봉 합계 {won(payroll)} · <span style={{ color: "var(--ok)" }}>DB 공유</span>
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => { setEdit(null); setOpen(true); }} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 직원 추가</button>
        </div>
      </div>

      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner)", background: "var(--owner-bg)" }}>{err}</div>}

      <div style={{ marginBottom: 14 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·직책·연락처 검색…" style={{ ...inputStyle, maxWidth: 280 }} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 760 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
              <th style={th}>이름</th>
              <th style={th}>직책</th>
              <th style={th}>입사일</th>
              <th style={{ ...th, textAlign: "right" }}>연봉</th>
              <th style={th}>연락처</th>
              <th style={th}>특이사항</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ padding: 24, textAlign: "center" }}>등록된 직원이 없습니다. ‘+ 직원 추가’로 등록하세요.</td></tr>
            )}
            {list.map((e) => (
              <tr key={e.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ ...td, fontWeight: 600 }}>{e.name}</td>
                <td style={td}>{e.position || "-"}</td>
                <td style={td}>{e.hireDate || "-"}</td>
                <td style={{ ...td, textAlign: "right" }}>{won(e.salary)}</td>
                <td style={td}>{e.phone || "-"}</td>
                <td style={{ ...td, color: "var(--ink-2)", maxWidth: 260 }}>{e.note || "-"}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button className="btn" style={smBtn} onClick={() => { setEdit(e); setOpen(true); }}>수정</button>{" "}
                  <button className="btn" style={{ ...smBtn, color: "var(--owner)" }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deleteEmp(e.id)); }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <EmpModal
          initial={edit}
          pending={pending}
          onClose={() => setOpen(false)}
          onSave={(e) => {
            const { id, ...inp } = e;
            run(id ? updateEmp(id, inp) : createEmp(inp));
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function EmpModal({ initial, pending, onClose, onSave }: { initial: Emp | null; pending: boolean; onClose: () => void; onSave: (e: Emp) => void }) {
  const [f, setF] = useState<Emp>(initial ?? emptyEmp());
  const set = (k: keyof Emp, v: any) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div onMouseDown={onClose} style={backdrop}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "직원 수정" : "직원 추가"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="이름"><input style={inputStyle} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="직책"><input style={inputStyle} value={f.position} onChange={(e) => set("position", e.target.value)} /></Field>
          <Field label="입사일"><input type="date" style={inputStyle} value={f.hireDate} onChange={(e) => set("hireDate", e.target.value)} /></Field>
          <Field label="연봉(원)"><input type="number" style={inputStyle} value={f.salary} onChange={(e) => set("salary", Number(e.target.value))} /></Field>
          <Field label="연락처"><input style={inputStyle} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <div />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="특이사항"><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
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
