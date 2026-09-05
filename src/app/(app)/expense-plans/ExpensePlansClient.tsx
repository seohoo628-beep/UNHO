"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import CopyForKakaoButton from "@/components/CopyForKakaoButton";
import { TAG_BRANDS } from "@/lib/brands";
import {
  createExpensePlan,
  updateExpensePlan,
  deleteExpensePlan,
  setExpenseActual,
  reorderExpensePlans,
  copyExpensePlans,
  type ExpensePlanInput,
  type ExpenseKind,
} from "./actions";

export interface ExpensePlan extends ExpensePlanInput {
  id: string;
  sortOrder: number;
}

const SETUP_SQL = `create table if not exists public.expense_plans (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  kind text not null default '고정',
  category text,
  name text not null,
  planned bigint not null default 0,
  actual bigint not null default 0,
  due_day int,
  brand text,
  memo text,
  sort_order int not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expense_plans_month_idx on public.expense_plans(month, kind, sort_order);
alter table public.expense_plans enable row level security;
drop policy if exists expense_plans_all on public.expense_plans;
create policy expense_plans_all on public.expense_plans for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const KINDS: { key: ExpenseKind; label: string; desc: string; icon: string }[] = [
  { key: "고정", label: "고정비", desc: "매달 거의 같은 금액이 나가는 지출 (임대료·인건비·구독료 등)", icon: "🏢" },
  { key: "변동", label: "변동비", desc: "매출·활동에 따라 달라지는 지출 (광고비·사입·배송비 등)", icon: "📈" },
];

const CATEGORY_SUGGEST: Record<ExpenseKind, string[]> = {
  고정: ["임대료", "인건비", "4대보험", "관리비", "통신비", "구독·SaaS", "보험료", "대출상환", "세금·공과금", "리스·렌탈", "기타"],
  변동: ["광고비", "사입·원자재", "배송·물류", "외주·용역", "수수료", "접대·회식", "출장·교통", "소모품", "행사·프로모션", "기타"],
};

const won = (n: number) => (n ? n.toLocaleString("ko-KR") : "0");
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  return `${y}년 ${Number(mo)}월`;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};
const th: React.CSSProperties = { padding: "10px 10px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", verticalAlign: "middle" };
const smBtn: React.CSSProperties = { padding: "3px 8px", fontSize: 12 };
const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 };

function empty(month: string, kind: ExpenseKind): ExpensePlanInput {
  return { month, kind, category: "", name: "", planned: 0, actual: 0, dueDay: null, brand: "", memo: "" };
}

export default function ExpensePlansClient({
  month,
  prevMonth,
  nextMonth,
  thisMonth,
  months,
  initial,
  dbReady,
}: {
  month: string;
  prevMonth: string;
  nextMonth: string;
  thisMonth: string;
  months: string[];
  initial: ExpensePlan[];
  dbReady: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ExpensePlan[]>(initial);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<{ kind: ExpenseKind; edit: ExpensePlan | null } | null>(null);
  const [copyKinds, setCopyKinds] = useState<ExpenseKind[]>(["고정"]);

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  const byKind = useMemo(() => {
    const m: Record<ExpenseKind, ExpensePlan[]> = { 고정: [], 변동: [] };
    for (const r of rows) m[r.kind].push(r);
    for (const k of Object.keys(m) as ExpenseKind[]) m[k].sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [rows]);

  const sum = (list: ExpensePlan[], f: "planned" | "actual") => list.reduce((s, r) => s + (Number(r[f]) || 0), 0);
  const fixedP = sum(byKind.고정, "planned");
  const fixedA = sum(byKind.고정, "actual");
  const varP = sum(byKind.변동, "planned");
  const varA = sum(byKind.변동, "actual");
  const totalP = fixedP + varP;
  const totalA = fixedA + varA;
  const diff = totalP - totalA;

  const go = (m: string) => router.push(`/expense-plans?m=${m}`);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; count?: number }>, after?: (count?: number) => void) => {
    setErr(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setErr(r.error ?? "저장에 실패했습니다.");
        return;
      }
      after?.(r.count);
      router.refresh();
    });
  };

  const save = (inp: ExpensePlanInput, id?: string) => {
    run(() => (id ? updateExpensePlan(id, inp) : createExpensePlan(inp)), () => setModal(null));
  };

  const remove = (r: ExpensePlan) => {
    if (!confirm(`‘${r.name}’ 항목을 삭제할까요?`)) return;
    setRows((p) => p.filter((x) => x.id !== r.id));
    run(() => deleteExpensePlan(r.id));
  };

  const setActual = (r: ExpensePlan, v: number) => {
    if (v === r.actual) return;
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, actual: v } : x)));
    run(() => setExpenseActual(r.id, v));
  };

  const moveRow = (kind: ExpenseKind, idx: number, dir: -1 | 1) => {
    const list = [...byKind[kind]];
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    const ids = list.map((x) => x.id);
    setRows((p) => p.map((x) => (x.kind === kind ? { ...x, sortOrder: ids.indexOf(x.id) + 1 } : x)));
    run(() => reorderExpensePlans(ids));
  };

  const copyPrev = () => {
    run(
      () => copyExpensePlans(prevMonth, month, copyKinds),
      (count) => {
        if (count === 0) setErr(`${monthLabel(prevMonth)}에서 복사할 항목이 없거나 이미 모두 등록되어 있습니다.`);
      }
    );
  };

  const kakaoText = () => {
    const lines: string[] = [`💸 ${monthLabel(month)} 지출계획표`, ""];
    for (const k of KINDS) {
      const list = byKind[k.key];
      lines.push(`${k.icon} ${k.label}  계획 ${won(sum(list, "planned"))}원 / 실제 ${won(sum(list, "actual"))}원`);
      for (const r of list) {
        const d = r.dueDay ? ` (${r.dueDay}일)` : "";
        const a = r.actual ? ` → 실제 ${won(r.actual)}` : "";
        lines.push(`- ${r.name}${r.category ? ` [${r.category}]` : ""}${d}: ${won(r.planned)}${a}`);
      }
      if (list.length === 0) lines.push("- (없음)");
      lines.push("");
    }
    lines.push(`합계  계획 ${won(totalP)}원 / 실제 ${won(totalA)}원 / 차이 ${diff >= 0 ? "" : "-"}${won(Math.abs(diff))}원`);
    return lines.join("\n");
  };

  if (!dbReady) {
    return (
      <div>
        <h1>💸 지출계획표</h1>
        <DbSetupNotice title="지출계획표 (월별 고정비·변동비)" sql={SETUP_SQL} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>💸 지출계획표</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            월별 고정비·변동비 계획과 실제 지출을 기록합니다 · <span style={{ color: "var(--ok, #16a34a)" }}>DB 공유</span>
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <CopyForKakaoButton text={kakaoText} label="카톡 복사" share />
        </div>
      </div>

      {/* 월 선택 */}
      <div className="card" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" style={smBtn} onClick={() => go(prevMonth)} aria-label="이전 달">◀</button>
        <select value={months.includes(month) ? month : "__cur"} onChange={(e) => go(e.target.value === "__cur" ? month : e.target.value)} style={{ ...inputStyle, width: "auto", fontWeight: 700, padding: "6px 10px" }}>
          {!months.includes(month) && <option value="__cur">{monthLabel(month)}</option>}
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <button className="btn" style={smBtn} onClick={() => go(nextMonth)} aria-label="다음 달">▶</button>
        {month !== thisMonth && (
          <button className="btn" style={smBtn} onClick={() => go(thisMonth)}>이번 달</button>
        )}
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
          <span className="muted">{monthLabel(prevMonth)}에서 복사:</span>
          {KINDS.map((k) => (
            <label key={k.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={copyKinds.includes(k.key)}
                onChange={(e) => setCopyKinds((p) => (e.target.checked ? Array.from(new Set([...p, k.key])) : p.filter((x) => x !== k.key)))}
              />
              {k.label}
            </label>
          ))}
          <button className="btn" style={smBtn} disabled={pending || copyKinds.length === 0} onClick={copyPrev}>📋 가져오기</button>
        </div>
      </div>

      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner, #b91c1c)", background: "var(--owner-bg, #fef2f2)" }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="고정비 계획 / 실제" value={`${won(fixedP)} / ${won(fixedA)}`} />
        <Stat label="변동비 계획 / 실제" value={`${won(varP)} / ${won(varA)}`} />
        <Stat label="총 계획" value={won(totalP)} accent />
        <Stat label="총 실제 지출" value={won(totalA)} accent />
        <Stat label={diff >= 0 ? "잔여 (계획 − 실제)" : "초과 지출"} value={`${diff < 0 ? "-" : ""}${won(Math.abs(diff))}`} danger={diff < 0} />
      </div>

      {KINDS.map((k) => {
        const list = byKind[k.key];
        const p = sum(list, "planned");
        const a = sum(list, "actual");
        return (
          <section key={k.key} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17 }}>{k.icon} {k.label} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>{list.length}건</span></h2>
                <div className="muted" style={{ fontSize: 12 }}>{k.desc}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13 }}>계획 <b>{won(p)}</b> · 실제 <b style={{ color: a > p ? "var(--owner, #b91c1c)" : "var(--ink)" }}>{won(a)}</b></span>
                <button className="btn" style={{ ...smBtn, background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }} onClick={() => setModal({ kind: k.key, edit: null })}>+ {k.label} 추가</button>
              </div>
            </div>

            <div className="card" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 760 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
                    <th style={{ ...th, width: 56 }}></th>
                    <th style={th}>항목</th>
                    <th style={th}>카테고리</th>
                    <th style={th}>브랜드</th>
                    <th style={{ ...th, textAlign: "center" }}>지급일</th>
                    <th style={{ ...th, textAlign: "right" }}>계획</th>
                    <th style={{ ...th, textAlign: "right" }}>실제</th>
                    <th style={{ ...th, textAlign: "right" }}>차이</th>
                    <th style={th}>메모</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 && (
                    <tr><td colSpan={10} className="muted" style={{ padding: 22, textAlign: "center" }}>{k.label} 항목이 없습니다. ‘+ {k.label} 추가’ 또는 이전 달에서 가져오기.</td></tr>
                  )}
                  {list.map((r, i) => {
                    const d = r.planned - r.actual;
                    return (
                      <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <button className="btn" style={{ padding: "1px 5px", fontSize: 11 }} disabled={i === 0 || pending} onClick={() => moveRow(k.key, i, -1)} aria-label="위로">▲</button>
                          <button className="btn" style={{ padding: "1px 5px", fontSize: 11, marginLeft: 2 }} disabled={i === list.length - 1 || pending} onClick={() => moveRow(k.key, i, 1)} aria-label="아래로">▼</button>
                        </td>
                        <td data-label="항목" style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                        <td data-label="카테고리" style={{ ...td, color: "var(--ink-2)" }}>{r.category || "-"}</td>
                        <td data-label="브랜드" style={{ ...td, color: "var(--ink-2)" }}>{r.brand || "-"}</td>
                        <td data-label="지급일" style={{ ...td, textAlign: "center" }}>{r.dueDay ? `${r.dueDay}일` : "-"}</td>
                        <td data-label="계획" style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{won(r.planned)}</td>
                        <td data-label="실제" style={{ ...td, textAlign: "right" }}>
                          <ActualInput value={r.actual} onCommit={(v) => setActual(r, v)} />
                        </td>
                        <td data-label="차이" style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: d < 0 ? "var(--owner, #b91c1c)" : d > 0 ? "var(--ok, #16a34a)" : "var(--ink-2)" }}>
                          {r.actual ? `${d < 0 ? "-" : d > 0 ? "+" : ""}${won(Math.abs(d))}` : "-"}
                        </td>
                        <td data-label="메모" style={{ ...td, color: "var(--ink-2)", maxWidth: 220, whiteSpace: "pre-wrap", fontSize: 12.5 }}>{r.memo || ""}</td>
                        <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                          <button className="btn" style={smBtn} onClick={() => setModal({ kind: k.key, edit: r })}>수정</button>
                          <button className="btn" style={{ ...smBtn, marginLeft: 4, color: "var(--owner, #b91c1c)" }} onClick={() => remove(r)}>삭제</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {list.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--line-2)", fontWeight: 700 }}>
                      <td style={td} colSpan={5}>{k.label} 합계</td>
                      <td style={{ ...td, textAlign: "right" }}>{won(p)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{won(a)}</td>
                      <td style={{ ...td, textAlign: "right", color: p - a < 0 ? "var(--owner, #b91c1c)" : "var(--ink)" }}>{a ? `${p - a < 0 ? "-" : ""}${won(Math.abs(p - a))}` : "-"}</td>
                      <td style={td} colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        );
      })}

      {modal && (
        <PlanModal
          month={month}
          kind={modal.kind}
          initial={modal.edit}
          pending={pending}
          onClose={() => setModal(null)}
          onSave={(inp) => save(inp, modal.edit?.id)}
        />
      )}
    </div>
  );
}

function ActualInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value ? String(value) : "");
  useEffect(() => {
    setV(value ? String(value) : "");
  }, [value]);
  const commit = () => {
    const n = Math.max(0, Math.round(Number(v.replace(/[^\d.]/g, "")) || 0));
    onCommit(n);
  };
  return (
    <input
      value={v}
      inputMode="numeric"
      placeholder="0"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      style={{ ...inputStyle, width: 110, padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
    />
  );
}

function Stat({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="card" style={{ padding: "12px 14px" }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2, color: danger ? "var(--owner, #b91c1c)" : accent ? "var(--accent)" : "var(--ink)" }}>{value}</div>
    </div>
  );
}

function PlanModal({
  month,
  kind,
  initial,
  pending,
  onClose,
  onSave,
}: {
  month: string;
  kind: ExpenseKind;
  initial: ExpensePlan | null;
  pending: boolean;
  onClose: () => void;
  onSave: (inp: ExpensePlanInput) => void;
}) {
  const [f, setF] = useState<ExpensePlanInput>(initial ? { ...initial } : empty(month, kind));
  const set = (k: keyof ExpensePlanInput, v: any) => setF((p) => ({ ...p, [k]: v }));
  const listId = `cat-${f.kind}`;

  return (
    <div style={backdrop} onMouseDown={onClose}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ marginTop: 0, fontSize: 17 }}>{initial ? "지출 항목 수정" : `${f.kind === "고정" ? "고정비" : "변동비"} 항목 추가`} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· {monthLabel(f.month)}</span></h2>

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              className="btn"
              style={{ ...smBtn, ...(f.kind === k.key ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : {}) }}
              onClick={() => set("kind", k.key)}
            >
              {k.icon} {k.label}
            </button>
          ))}
        </div>

        <label className="field"><span>항목명 *</span>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 사무실 임대료, 메타 광고비" autoFocus style={inputStyle} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label className="field"><span>카테고리</span>
            <input list={listId} value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="선택 또는 입력" style={inputStyle} />
            <datalist id={listId}>
              {CATEGORY_SUGGEST[f.kind].map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label className="field"><span>브랜드</span>
            <select value={f.brand} onChange={(e) => set("brand", e.target.value)} style={inputStyle}>
              <option value="">-</option>
              {TAG_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <label className="field"><span>계획 금액(원)</span>
            <input type="number" min={0} step={1000} value={f.planned || ""} onChange={(e) => set("planned", Number(e.target.value) || 0)} placeholder="0" style={inputStyle} />
          </label>
          <label className="field"><span>실제 지출(원)</span>
            <input type="number" min={0} step={1000} value={f.actual || ""} onChange={(e) => set("actual", Number(e.target.value) || 0)} placeholder="0" style={inputStyle} />
          </label>
          <label className="field"><span>지급일</span>
            <input type="number" min={1} max={31} value={f.dueDay ?? ""} onChange={(e) => set("dueDay", e.target.value === "" ? null : Number(e.target.value))} placeholder="일" style={inputStyle} />
          </label>
        </div>
        <label className="field"><span>메모</span>
          <textarea value={f.memo} onChange={(e) => set("memo", e.target.value)} rows={3} placeholder="지급 계좌, 계약 조건, 특이사항 등" style={{ ...inputStyle, resize: "vertical" }} />
        </label>
        <div className="btn-row" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <button className="btn" onClick={onClose} disabled={pending}>취소</button>
          <button className="btn primary" disabled={pending || !f.name.trim()} onClick={() => onSave(f)}>{pending ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
