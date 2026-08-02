"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { createReceivable, updateReceivable, deleteReceivable, type ReceivableInput } from "./actions";

export interface Receivable extends ReceivableInput {
  id: string;
}

const SETUP_SQL = `create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  counterparty text not null, item text,
  billed bigint not null default 0, received bigint not null default 0,
  bill_date date, due_date date, note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists receivables_due_idx on public.receivables(due_date);
alter table public.receivables enable row level security;
drop policy if exists receivables_all on public.receivables;
create policy receivables_all on public.receivables for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const won = (n: number) => (n ? n.toLocaleString("ko-KR") : "-");
const empty = (): Receivable => ({ id: "", counterparty: "", item: "", billed: 0, received: 0, billDate: "", dueDate: "", note: "" });

// 상태 파생: 완료 / 부분입금 / 지연 / 미수
function statusOf(r: Receivable, today: string): { label: string; color: string } {
  const outstanding = r.billed - r.received;
  if (outstanding <= 0 && r.billed > 0) return { label: "완료", color: "var(--ok, #16a34a)" };
  if (r.dueDate && r.dueDate < today && outstanding > 0) return { label: "지연", color: "var(--owner, #b91c1c)" };
  if (r.received > 0) return { label: "부분입금", color: "var(--accent)" };
  return { label: "미수", color: "var(--ink-2)" };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};

export default function ReceivablesClient({ rows, dbReady, today }: { rows: Receivable[]; dbReady: boolean; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [edit, setEdit] = useState<Receivable | null>(null);
  const [open, setOpen] = useState(false);
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

  const list = useMemo(
    () =>
      rows.filter((r) => {
        const outstanding = r.billed - r.received;
        if (onlyOpen && outstanding <= 0) return false;
        return !q || (r.counterparty + r.item + r.note).toLowerCase().includes(q.toLowerCase());
      }),
    [rows, q, onlyOpen]
  );

  const totalBilled = rows.reduce((s, r) => s + r.billed, 0);
  const totalReceived = rows.reduce((s, r) => s + r.received, 0);
  const totalOutstanding = totalBilled - totalReceived;
  const overdue = rows.reduce((s, r) => s + (r.dueDate && r.dueDate < today ? Math.max(0, r.billed - r.received) : 0), 0);

  if (!dbReady) {
    return (
      <div>
        <div className="page-head">
          <h1 style={{ margin: 0 }}>🧾 미수금 내역</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>거래처별 청구·입금·미수 잔액 관리.</p>
        </div>
        <DbSetupNotice title="미수금 내역" sql={SETUP_SQL} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🧾 미수금 내역</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            거래처 {rows.length}건 · <span style={{ color: "var(--ok, #16a34a)" }}>DB 공유</span>
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
        <button className="btn" onClick={() => { setEdit(null); setOpen(true); }} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 미수금 추가</button>
      </div>

      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner, #b91c1c)", background: "var(--owner-bg, #fef2f2)" }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="총 청구액" value={won(totalBilled)} />
        <Stat label="총 입금액" value={won(totalReceived)} />
        <Stat label="미수금 잔액" value={won(totalOutstanding)} accent />
        <Stat label="연체(예정일 경과)" value={won(overdue)} danger />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처·항목 검색…" style={{ ...inputStyle, maxWidth: 260 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-2)" }}>
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> 미수 잔액만
        </label>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 880 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
              <th style={th}>거래처</th>
              <th style={th}>항목</th>
              <th style={{ ...th, textAlign: "right" }}>청구액</th>
              <th style={{ ...th, textAlign: "right" }}>입금액</th>
              <th style={{ ...th, textAlign: "right" }}>미수금</th>
              <th style={th}>청구일</th>
              <th style={th}>입금예정</th>
              <th style={th}>상태</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ padding: 24, textAlign: "center" }}>내역이 없습니다. ‘+ 미수금 추가’로 등록하세요.</td></tr>
            )}
            {list.map((r) => {
              const outstanding = r.billed - r.received;
              const st = statusOf(r, today);
              return (
                <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.counterparty}</td>
                  <td style={{ ...td, color: "var(--ink-2)", maxWidth: 200 }}>{r.item || "-"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{won(r.billed)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{won(r.received)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: outstanding > 0 ? "var(--owner, #b91c1c)" : "var(--ink-2)" }}>{won(outstanding)}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", color: "var(--ink-2)" }}>{r.billDate || "-"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", color: st.label === "지연" ? "var(--owner, #b91c1c)" : "var(--ink-2)" }}>{r.dueDate || "-"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 700, color: st.color }}>{st.label}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <button className="btn" style={smBtn} onClick={() => { setEdit(r); setOpen(true); }}>수정</button>{" "}
                    <button className="btn" style={{ ...smBtn, color: "var(--owner, #b91c1c)" }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deleteReceivable(r.id)); }}>삭제</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <ReceivableModal
          initial={edit}
          today={today}
          pending={pending}
          onClose={() => setOpen(false)}
          onSave={(r) => {
            const { id, ...inp } = r;
            run(id ? updateReceivable(id, inp) : createReceivable(inp));
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="card" style={{ padding: "12px 14px" }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: danger ? "var(--owner, #b91c1c)" : accent ? "var(--accent)" : "var(--ink)" }}>{value}</div>
    </div>
  );
}

function ReceivableModal({ initial, today, pending, onClose, onSave }: { initial: Receivable | null; today: string; pending: boolean; onClose: () => void; onSave: (r: Receivable) => void }) {
  const [f, setF] = useState<Receivable>(initial ?? { ...empty(), billDate: today });
  const set = (k: keyof Receivable, v: any) => setF((p) => ({ ...p, [k]: v }));
  const outstanding = (Number(f.billed) || 0) - (Number(f.received) || 0);
  return (
    <div onMouseDown={onClose} style={backdrop}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "미수금 수정" : "미수금 추가"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="거래처"><input style={inputStyle} value={f.counterparty} onChange={(e) => set("counterparty", e.target.value)} /></Field>
          <Field label="항목/내용"><input style={inputStyle} value={f.item} onChange={(e) => set("item", e.target.value)} /></Field>
          <Field label="청구액(원)"><input type="number" style={inputStyle} value={f.billed} onChange={(e) => set("billed", Number(e.target.value))} /></Field>
          <Field label="입금액(원)"><input type="number" style={inputStyle} value={f.received} onChange={(e) => set("received", Number(e.target.value))} /></Field>
          <Field label="청구일"><input type="date" style={inputStyle} value={f.billDate} onChange={(e) => set("billDate", e.target.value)} /></Field>
          <Field label="입금예정일"><input type="date" style={inputStyle} value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="비고"><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          미수금 잔액 <b style={{ color: outstanding > 0 ? "var(--owner, #b91c1c)" : "var(--ink)" }}>{won(outstanding)}원</b>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn" disabled={!f.counterparty.trim() || pending} onClick={() => onSave(f)} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>저장</button>
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
