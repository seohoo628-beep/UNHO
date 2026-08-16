"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { createPayable, updatePayable, deletePayable, settlePayable, payInstallment, type PayableInput } from "./actions";
import FolderHistoryButton from "@/components/FolderHistoryButton";

const payLabel = (freq: string) =>
  freq === "매일" ? "오늘 납입완료" : freq === "매주" ? "이번주 납입완료" : freq === "매월" ? "이번달 납입완료" : "납입완료";

export interface Payable extends PayableInput {
  id: string;
  settledAt?: string;
}

const SETTLE_SQL = `alter table public.payables add column if not exists settled_at timestamptz;`;

const SETUP_SQL = `create table if not exists public.payables (
  id uuid primary key default gen_random_uuid(),
  counterparty text not null, item text,
  amount bigint not null default 0, paid bigint not null default 0,
  bill_date date, due_date date, note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payables_due_idx on public.payables(due_date);
alter table public.payables enable row level security;
drop policy if exists payables_all on public.payables;
create policy payables_all on public.payables for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const UPGRADE_SQL = `alter table public.payables add column if not exists principal bigint not null default 0;
alter table public.payables add column if not exists interest bigint not null default 0;
alter table public.payables add column if not exists component text;
alter table public.payables add column if not exists frequency text not null default '없음';
alter table public.payables add column if not exists period_amount bigint not null default 0;
alter table public.payables add column if not exists has_end boolean not null default false;
alter table public.payables add column if not exists end_date date;`;

const FREQS = ["없음", "매일", "매주", "매월"];
const COMPONENTS = ["원금", "이자", "원금+이자"];

const won = (n: number) => (n ? n.toLocaleString("ko-KR") : "-");
const empty = (): Payable => ({
  id: "", counterparty: "", item: "", amount: 0, paid: 0, billDate: "", dueDate: "", note: "",
  principal: 0, interest: 0, component: "원금+이자", frequency: "없음", periodAmount: 0, hasEnd: false, endDate: "",
});

// 상태 파생: 완료 / 부분지급 / 지연 / 미지급
function statusOf(r: Payable, today: string): { label: string; color: string } {
  const outstanding = r.amount - r.paid;
  if (outstanding <= 0 && r.amount > 0) return { label: "완료", color: "var(--ok, #16a34a)" };
  if (r.dueDate && r.dueDate < today && outstanding > 0) return { label: "지연", color: "var(--owner, #b91c1c)" };
  if (r.paid > 0) return { label: "부분지급", color: "var(--accent)" };
  return { label: "미지급", color: "var(--ink-2)" };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};

export default function PayablesClient({ rows, dbReady, today, needsUpgrade, settleReady }: { rows: Payable[]; dbReady: boolean; today: string; needsUpgrade?: boolean; settleReady?: boolean }) {
  return dbReady ? (
    <Board rows={rows} today={today} needsUpgrade={needsUpgrade} settleReady={settleReady} />
  ) : (
    <>
      <div className="page-head">
        <h1 style={{ margin: 0 }}>미지급금 내역</h1>
      </div>
      <DbSetupNotice title="미지급금 내역" sql={SETUP_SQL} />
    </>
  );
}

function Board({ rows, today, needsUpgrade, settleReady }: { rows: Payable[]; today: string; needsUpgrade?: boolean; settleReady?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [edit, setEdit] = useState<Payable | null>(null);
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

  const activeRows = useMemo(() => rows.filter((r) => !r.settledAt), [rows]);
  const settledRows = useMemo(() => rows.filter((r) => !!r.settledAt), [rows]);

  const list = useMemo(
    () =>
      activeRows.filter((r) => {
        const outstanding = r.amount - r.paid;
        if (onlyOpen && outstanding <= 0) return false;
        return !q || (r.counterparty + r.item + r.note).toLowerCase().includes(q.toLowerCase());
      }),
    [activeRows, q, onlyOpen]
  );

  const totalAmount = activeRows.reduce((s, r) => s + r.amount, 0);
  const totalPaid = activeRows.reduce((s, r) => s + r.paid, 0);
  const totalOutstanding = totalAmount - totalPaid;
  const overdue = activeRows.reduce((s, r) => s + (r.dueDate && r.dueDate < today ? Math.max(0, r.amount - r.paid) : 0), 0);

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🔒 미지급금 내역</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            거래처에 지급할 내역 {rows.length}건 · <span style={{ color: "var(--ok, #16a34a)" }}>DB 공유</span>
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <FolderHistoryButton entity="payables" label="미지급금" />
          <button className="btn" onClick={() => { setEdit(null); setOpen(true); }} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>+ 미지급 추가</button>
        </div>
      </div>

      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner, #b91c1c)", background: "var(--owner-bg, #fef2f2)" }}>{err}</div>}

      {needsUpgrade && (
        <div style={{ marginBottom: 14 }}>
          <DbSetupNotice title="미지급금 정기 지급 기능(원금·이자·주기·종료일)" sql={UPGRADE_SQL} />
        </div>
      )}

      {!settleReady && (
        <div style={{ marginBottom: 14 }}>
          <DbSetupNotice title="지급완료 기능 (완료 처리·완료함으로 이동)" sql={SETTLE_SQL} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="총 지급예정액" value={won(totalAmount)} />
        <Stat label="총 지급액" value={won(totalPaid)} />
        <Stat label="미지급 잔액" value={won(totalOutstanding)} accent />
        <Stat label="연체(예정일 경과)" value={won(overdue)} danger />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처·항목 검색…" style={{ ...inputStyle, maxWidth: 260 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-2)" }}>
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> 미지급 잔액만
        </label>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 880 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
              <th style={th}>거래처</th>
              <th style={th}>항목</th>
              <th style={{ ...th, textAlign: "right" }}>지급예정액</th>
              <th style={{ ...th, textAlign: "right" }}>지급액</th>
              <th style={{ ...th, textAlign: "right" }}>미지급</th>
              <th style={th}>청구일</th>
              <th style={th}>지급예정</th>
              <th style={th}>상태</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ padding: 24, textAlign: "center" }}>내역이 없습니다. ‘+ 미지급 추가’로 등록하세요.</td></tr>
            )}
            {list.map((r) => {
              const outstanding = r.amount - r.paid;
              const st = statusOf(r, today);
              return (
                <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td data-label="거래처" style={{ ...td, fontWeight: 600 }}>{r.counterparty}</td>
                  <td data-label="항목" style={{ ...td, color: "var(--ink-2)", maxWidth: 240 }}>
                    {r.item || "-"}
                    {r.frequency && r.frequency !== "없음" && (
                      <div style={{ fontSize: 11.5, color: "var(--accent)", marginTop: 2 }}>
                        🔁 {r.frequency} {won(r.periodAmount)}원 · {r.component || "원금+이자"}
                        {r.component !== "이자" && r.principal ? ` · 원금잔액 ${won(r.principal)}` : ""}
                        {r.component === "원금+이자" && r.interest ? ` · 회차이자 ${won(r.interest)}` : ""}
                        {" · "}{r.hasEnd ? `종료 ${r.endDate || "-"}` : "무기한"}
                      </div>
                    )}
                  </td>
                  <td data-label="지급예정액" style={{ ...td, textAlign: "right" }}>{won(r.amount)}</td>
                  <td data-label="지급액" style={{ ...td, textAlign: "right" }}>{won(r.paid)}</td>
                  <td data-label="미지급" style={{ ...td, textAlign: "right", fontWeight: 700, color: outstanding > 0 ? "var(--owner, #b91c1c)" : "var(--ink-2)" }}>{won(outstanding)}</td>
                  <td data-label="청구일" style={{ ...td, whiteSpace: "nowrap", color: "var(--ink-2)" }}>{r.billDate || "-"}</td>
                  <td data-label="지급예정" style={{ ...td, whiteSpace: "nowrap", color: st.label === "지연" ? "var(--owner, #b91c1c)" : "var(--ink-2)" }}>{r.dueDate || "-"}</td>
                  <td data-label="상태" style={{ ...td, whiteSpace: "nowrap", fontWeight: 700, color: st.color }}>{st.label}</td>
                  <td data-label="관리" style={{ ...td, whiteSpace: "nowrap" }}>
                    {r.frequency && r.frequency !== "없음" && (
                      <>
                        <button className="btn" style={{ ...smBtn, background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }} disabled={pending} onClick={() => run(payInstallment(r.id))} title="이번 회차 납입 처리 → 다음 예정일로 이동(연체 해소)">{payLabel(r.frequency)}</button>{" "}
                      </>
                    )}
                    {settleReady && (
                      <>
                        <button className="btn" style={{ ...smBtn, background: "var(--ok, #16a34a)", color: "#fff", borderColor: "var(--ok, #16a34a)" }} disabled={pending} onClick={() => run(settlePayable(r.id, true))} title={r.frequency && r.frequency !== "없음" ? "완전 종료(완료함으로 이동)" : "지급완료"}>{r.frequency && r.frequency !== "없음" ? "종료" : "지급완료"}</button>{" "}
                      </>
                    )}
                    <button className="btn" style={smBtn} onClick={() => { setEdit(r); setOpen(true); }}>수정</button>{" "}
                    <button className="btn" style={{ ...smBtn, color: "var(--owner, #b91c1c)" }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deletePayable(r.id)); }}>삭제</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 지급완료 섹션 */}
      {settledRows.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button className="btn" onClick={() => setShowDone((v) => !v)} style={{ marginBottom: 10 }}>
            {showDone ? "▼" : "▶"} 지급완료 ({settledRows.length})
          </button>
          {showDone && (
            <div className="card" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 720 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
                    <th style={th}>거래처</th>
                    <th style={th}>항목</th>
                    <th style={{ ...th, textAlign: "right" }}>지급액</th>
                    <th style={th}>완료일</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {settledRows.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--line)", opacity: 0.8 }}>
                      <td style={{ ...td, fontWeight: 600, textDecoration: "line-through" }}>{r.counterparty}</td>
                      <td style={{ ...td, color: "var(--ink-2)" }}>{r.item || "-"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{won(r.paid || r.amount)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: "var(--ink-2)" }}>{(r.settledAt || "").slice(0, 10) || "-"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <button className="btn" style={smBtn} disabled={pending} onClick={() => run(settlePayable(r.id, false))}>되돌리기</button>{" "}
                        <button className="btn" style={{ ...smBtn, color: "var(--owner, #b91c1c)" }} disabled={pending} onClick={() => { if (confirm("삭제할까요?")) run(deletePayable(r.id)); }}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {open && (
        <PayableModal
          initial={edit}
          today={today}
          pending={pending}
          onClose={() => setOpen(false)}
          onSave={(r) => {
            const { id, ...inp } = r;
            run(id ? updatePayable(id, inp) : createPayable(inp));
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

function PayableModal({ initial, today, pending, onClose, onSave }: { initial: Payable | null; today: string; pending: boolean; onClose: () => void; onSave: (r: Payable) => void }) {
  const [f, setF] = useState<Payable>(initial ?? { ...empty(), billDate: today });
  const set = (k: keyof Payable, v: any) => setF((p) => ({ ...p, [k]: v }));
  const outstanding = (Number(f.amount) || 0) - (Number(f.paid) || 0);
  return (
    <div onMouseDown={onClose} style={backdrop}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>{initial ? "미지급 수정" : "미지급 추가"}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="거래처"><input style={inputStyle} value={f.counterparty} onChange={(e) => set("counterparty", e.target.value)} /></Field>
          <Field label="항목/내용"><input style={inputStyle} value={f.item} onChange={(e) => set("item", e.target.value)} /></Field>
          <Field label="지급예정액(만원)"><input type="number" step="0.1" style={inputStyle} value={f.amount ? f.amount / 10000 : ""} placeholder="0" onChange={(e) => set("amount", e.target.value === "" ? 0 : Math.round(Number(e.target.value) * 10000))} /></Field>
          <Field label="지급액(만원)"><input type="number" step="0.1" style={inputStyle} value={f.paid ? f.paid / 10000 : ""} placeholder="0" onChange={(e) => set("paid", e.target.value === "" ? 0 : Math.round(Number(e.target.value) * 10000))} /></Field>
          <Field label="청구일"><input type="date" style={inputStyle} value={f.billDate} onChange={(e) => set("billDate", e.target.value)} /></Field>
          <Field label="지급예정일(다음 지급일)"><input type="date" style={inputStyle} value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></Field>

          <div style={{ gridColumn: "1 / -1", borderTop: "1px dashed var(--line-2)", paddingTop: 10, marginTop: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)" }}>정기 지급 (매일·매주·매월 고정 납입)</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
              목록의 <b>납입완료</b> 버튼을 누르면 예정일이 다음 회차로 넘어가 <b>연체가 해소</b>되고, 원금+이자면 <b>원금 잔액에서 (회차−이자)</b>만큼 차감됩니다.
            </div>
          </div>
          <Field label="지급 주기">
            <select style={inputStyle} value={f.frequency} onChange={(e) => set("frequency", e.target.value)}>
              {FREQS.map((x) => <option key={x} value={x}>{x === "없음" ? "없음 (일시 지급)" : x}</option>)}
            </select>
          </Field>
          {f.frequency !== "없음" ? (
            <Field label="지급 구성">
              <select style={inputStyle} value={f.component} onChange={(e) => set("component", e.target.value)}>
                {COMPONENTS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
          ) : <div />}
          {f.frequency !== "없음" && (
            <>
              <Field label={`회차 지급액(만원) · ${f.frequency}`}><input type="number" step="0.1" style={inputStyle} value={f.periodAmount ? f.periodAmount / 10000 : ""} placeholder="0" onChange={(e) => set("periodAmount", e.target.value === "" ? 0 : Math.round(Number(e.target.value) * 10000))} /></Field>
              <div />
              <Field label="원금 잔액(만원)"><input type="number" step="0.1" style={inputStyle} value={f.principal ? f.principal / 10000 : ""} placeholder="0" onChange={(e) => set("principal", e.target.value === "" ? 0 : Math.round(Number(e.target.value) * 10000))} /></Field>
              <Field label="회차 이자(만원)"><input type="number" step="0.1" style={inputStyle} value={f.interest ? f.interest / 10000 : ""} placeholder="0" onChange={(e) => set("interest", e.target.value === "" ? 0 : Math.round(Number(e.target.value) * 10000))} /></Field>
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={f.hasEnd} onChange={(e) => set("hasEnd", e.target.checked)} /> 종료일 있음
                </label>
                {f.hasEnd ? (
                  <input type="date" style={{ ...inputStyle, width: "auto" }} value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>무기한 (종료일 없음)</span>
                )}
              </div>
            </>
          )}

          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="비고"><textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          미지급 잔액 <b style={{ color: outstanding > 0 ? "var(--owner, #b91c1c)" : "var(--ink)" }}>{won(outstanding)}원</b> · 금액은 만원 단위 입력(예: 100 = 100만원)
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
