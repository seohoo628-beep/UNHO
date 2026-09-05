"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import CopyForKakaoButton from "@/components/CopyForKakaoButton";
import PhotoPicker from "@/components/PhotoPicker";
import { TAG_BRANDS } from "@/lib/brands";
import {
  createExpensePlan,
  updateExpensePlan,
  deleteExpensePlan,
  setExpenseActual,
  reorderExpensePlans,
  copyExpensePlans,
  createLedgerEntry,
  updateLedgerEntry,
  deleteLedgerEntry,
  applyLedgerToPlans,
  type ExpensePlanInput,
  type ExpenseKind,
  type ExpenseScope,
  type LedgerInput,
  type LedgerType,
} from "./actions";

export interface ExpensePlan extends ExpensePlanInput {
  id: string;
  sortOrder: number;
}
export interface LedgerEntry extends LedgerInput {
  id: string;
}

type Tab = "plan" | "ledger";

const PLAN_SQL = `create table if not exists public.expense_plans (
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

const LEDGER_SQL = `alter table public.expense_plans add column if not exists scope text not null default '회사';
create index if not exists expense_plans_scope_idx on public.expense_plans(scope, month, kind, sort_order);
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  scope text not null default '회사',
  entry_date date not null,
  type text not null default '지출',
  category text,
  name text not null,
  amount bigint not null default 0,
  method text,
  brand text,
  memo text,
  plan_id uuid references public.expense_plans(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ledger_entries_date_idx on public.ledger_entries(scope, entry_date);
create index if not exists ledger_entries_plan_idx on public.ledger_entries(plan_id);
alter table public.ledger_entries enable row level security;
drop policy if exists ledger_entries_all on public.ledger_entries;
create policy ledger_entries_all on public.ledger_entries for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const PHOTOS_SQL = `alter table public.ledger_entries add column if not exists photos jsonb not null default '[]'::jsonb;`;

const SCOPES: { key: ExpenseScope; label: string; icon: string; desc: string }[] = [
  { key: "회사", label: "회사", icon: "🏢", desc: "회사 지출 계획·장부" },
  { key: "개인", label: "개인", icon: "🙋", desc: "개인 지출·가계부" },
];

const KINDS: { key: ExpenseKind; label: string; icon: string; desc: Record<ExpenseScope, string> }[] = [
  { key: "고정", label: "고정비", icon: "🏢", desc: { 회사: "매달 거의 같은 금액이 나가는 지출 (임대료·인건비·구독료 등)", 개인: "매달 고정으로 나가는 지출 (월세·관리비·보험·통신·대출 등)" } },
  { key: "변동", label: "변동비", icon: "📈", desc: { 회사: "매출·활동에 따라 달라지는 지출 (광고비·사입·배송비 등)", 개인: "달마다 달라지는 지출 (식비·쇼핑·여가·경조사 등)" } },
];

const PLAN_CAT: Record<ExpenseScope, Record<ExpenseKind, string[]>> = {
  회사: {
    고정: ["임대료", "인건비", "4대보험", "관리비", "통신비", "구독·SaaS", "보험료", "대출상환", "세금·공과금", "리스·렌탈", "기타"],
    변동: ["광고비", "사입·원자재", "배송·물류", "외주·용역", "수수료", "접대·회식", "출장·교통", "소모품", "행사·프로모션", "기타"],
  },
  개인: {
    고정: ["월세·관리비", "대출상환", "보험료", "통신비", "구독", "교육·학원", "용돈", "적금·저축", "세금·공과금", "기타"],
    변동: ["식비", "카페·간식", "쇼핑", "교통·주유", "의료·건강", "문화·여가", "여행", "경조사", "가족", "기타"],
  },
};

const LEDGER_CAT: Record<ExpenseScope, Record<LedgerType, string[]>> = {
  회사: {
    지출: ["임대료", "인건비", "광고비", "사입·원자재", "배송·물류", "외주·용역", "수수료", "접대·회식", "출장·교통", "소모품", "통신비", "구독·SaaS", "세금·공과금", "기타"],
    수입: ["매출 입금", "정산금", "투자·대출", "환급", "이자·배당", "기타"],
  },
  개인: {
    지출: ["식비", "카페·간식", "장보기", "교통·주유", "쇼핑", "의료·건강", "주거·관리비", "통신", "교육", "문화·여가", "여행", "경조사", "가족", "보험", "기타"],
    수입: ["급여", "배당·이자", "부업", "환급", "용돈", "기타"],
  },
};

const METHODS = ["카드", "현금", "계좌이체", "자동이체", "간편결제", "기타"];

const won = (n: number) => (n ? n.toLocaleString("ko-KR") : "0");
const signed = (n: number) => `${n < 0 ? "-" : n > 0 ? "+" : ""}${won(Math.abs(n))}`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  return `${y}년 ${Number(mo)}월`;
};
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dateLabel = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
  return `${m}월 ${dd}일 (${dow})`;
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
const activeBtn: React.CSSProperties = { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" };
const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(16,20,24,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 };
const RED = "var(--owner, #b91c1c)";
const GREEN = "var(--ok, #16a34a)";

function emptyPlan(scope: ExpenseScope, month: string, kind: ExpenseKind): ExpensePlanInput {
  return { scope, month, kind, category: "", name: "", planned: 0, actual: 0, dueDay: null, brand: "", memo: "" };
}
function emptyLedger(scope: ExpenseScope, date: string): LedgerInput {
  return { scope, date, type: "지출", category: "", name: "", amount: 0, method: "카드", brand: "", memo: "", planId: null, photos: [] };
}

type Res = { ok: boolean; error?: string; count?: number };

export default function ExpensePlansClient({
  scope,
  tab,
  month,
  prevMonth,
  nextMonth,
  thisMonth,
  today,
  months,
  initialPlans,
  initialLedger,
  dbReady,
  ledgerReady,
  photosReady = true,
}: {
  scope: ExpenseScope;
  tab: Tab;
  month: string;
  prevMonth: string;
  nextMonth: string;
  thisMonth: string;
  today: string;
  months: string[];
  initialPlans: ExpensePlan[];
  initialLedger: LedgerEntry[];
  dbReady: boolean;
  ledgerReady: boolean;
  photosReady?: boolean;
}) {
  const router = useRouter();
  const [plans, setPlans] = useState<ExpensePlan[]>(initialPlans);
  const [ledger, setLedger] = useState<LedgerEntry[]>(initialLedger);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [planModal, setPlanModal] = useState<{ kind: ExpenseKind; edit: ExpensePlan | null } | null>(null);
  const [ledgerEdit, setLedgerEdit] = useState<LedgerEntry | null>(null);
  const [copyKinds, setCopyKinds] = useState<ExpenseKind[]>(["고정"]);
  const [upBusy, setUpBusy] = useState(false);

  useEffect(() => setPlans(initialPlans), [initialPlans]);
  useEffect(() => setLedger(initialLedger), [initialLedger]);

  /* ── 이동 ── */
  const go = (p: { m?: string; s?: ExpenseScope; tab?: Tab }) => {
    const m = p.m ?? month;
    const s = p.s ?? scope;
    const t = p.tab ?? tab;
    router.push(`/expense-plans?m=${m}&s=${s === "개인" ? "personal" : "company"}&tab=${t}`);
  };

  const run = (fn: () => Promise<Res>, after?: (r: Res) => void) => {
    setErr(null);
    setNotice(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setErr(r.error ?? "저장에 실패했습니다.");
        return;
      }
      after?.(r);
      router.refresh();
    });
  };

  /* ── 지출계획 집계 ── */
  const byKind = useMemo(() => {
    const m: Record<ExpenseKind, ExpensePlan[]> = { 고정: [], 변동: [] };
    for (const r of plans) m[r.kind].push(r);
    for (const k of Object.keys(m) as ExpenseKind[]) m[k].sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [plans]);
  const sum = (list: ExpensePlan[], f: "planned" | "actual") => list.reduce((s, r) => s + (Number(r[f]) || 0), 0);
  const fixedP = sum(byKind.고정, "planned");
  const fixedA = sum(byKind.고정, "actual");
  const varP = sum(byKind.변동, "planned");
  const varA = sum(byKind.변동, "actual");
  const totalP = fixedP + varP;
  const totalA = fixedA + varA;
  const diff = totalP - totalA;

  // 계획 항목별 가계부 연결 합계
  const ledgerByPlan = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of ledger) if (e.type === "지출" && e.planId) m.set(e.planId, (m.get(e.planId) ?? 0) + e.amount);
    return m;
  }, [ledger]);

  /* ── 가계부 집계 ── */
  const income = ledger.filter((e) => e.type === "수입").reduce((s, e) => s + e.amount, 0);
  const expense = ledger.filter((e) => e.type === "지출").reduce((s, e) => s + e.amount, 0);
  const byDate = useMemo(() => {
    const m = new Map<string, LedgerEntry[]>();
    for (const e of ledger) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date)!.push(e);
    }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [ledger]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of ledger) if (e.type === "지출") m.set(e.category || "미분류", (m.get(e.category || "미분류") ?? 0) + e.amount);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [ledger]);

  /* ── 지출계획 동작 ── */
  const savePlan = (inp: ExpensePlanInput, id?: string) =>
    run(() => (id ? updateExpensePlan(id, inp) : createExpensePlan(inp)), () => setPlanModal(null));
  const removePlan = (r: ExpensePlan) => {
    if (!confirm(`‘${r.name}’ 항목을 삭제할까요?`)) return;
    setPlans((p) => p.filter((x) => x.id !== r.id));
    run(() => deleteExpensePlan(r.id));
  };
  const setActual = (r: ExpensePlan, v: number) => {
    if (v === r.actual) return;
    setPlans((p) => p.map((x) => (x.id === r.id ? { ...x, actual: v } : x)));
    run(() => setExpenseActual(r.id, v));
  };
  const moveRow = (kind: ExpenseKind, idx: number, dir: -1 | 1) => {
    const list = [...byKind[kind]];
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    const ids = list.map((x) => x.id);
    setPlans((p) => p.map((x) => (x.kind === kind ? { ...x, sortOrder: ids.indexOf(x.id) + 1 } : x)));
    run(() => reorderExpensePlans(ids));
  };
  const copyPrev = () =>
    run(
      () => copyExpensePlans(scope, prevMonth, month, copyKinds),
      (r) => setNotice(r.count ? `${monthLabel(prevMonth)} 항목 ${r.count}건을 가져왔습니다.` : `${monthLabel(prevMonth)}에서 가져올 항목이 없거나 이미 모두 등록되어 있습니다.`)
    );
  const applyLedger = () =>
    run(
      () => applyLedgerToPlans(scope, month),
      (r) => setNotice(r.count ? `가계부 합계를 ${r.count}개 항목의 실제 금액에 반영했습니다.` : "가계부에서 계획 항목에 연결된 지출이 없습니다. (가계부 입력 시 ‘연결 항목’을 지정하세요)")
    );

  /* ── 가계부 동작 ── */
  const saveLedger = (inp: LedgerInput, id?: string) =>
    run(() => (id ? updateLedgerEntry(id, inp) : createLedgerEntry(inp)), () => setLedgerEdit(null));
  const removeLedger = (e: LedgerEntry) => {
    if (!confirm(`‘${e.name}’ 기록을 삭제할까요?`)) return;
    setLedger((p) => p.filter((x) => x.id !== e.id));
    run(() => deleteLedgerEntry(e.id, e.photos ?? []));
  };

  /* ── 카톡 텍스트 ── */
  const scopeIcon = SCOPES.find((s) => s.key === scope)!.icon;
  const planText = () => {
    const lines: string[] = [`💸 ${monthLabel(month)} ${scope} 지출계획표 ${scopeIcon}`, ""];
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
    lines.push(`합계  계획 ${won(totalP)}원 / 실제 ${won(totalA)}원 / ${diff >= 0 ? "잔여" : "초과"} ${won(Math.abs(diff))}원`);
    return lines.join("\n");
  };
  const ledgerText = () => {
    const lines: string[] = [`📒 ${monthLabel(month)} ${scope} 가계부 ${scopeIcon}`, `수입 ${won(income)}원 · 지출 ${won(expense)}원 · 잔액 ${signed(income - expense)}원`, ""];
    for (const [d, list] of byDate) {
      const dayExp = list.filter((e) => e.type === "지출").reduce((s, e) => s + e.amount, 0);
      lines.push(`▪ ${dateLabel(d)}  지출 ${won(dayExp)}원`);
      for (const e of list) lines.push(`  ${e.type === "수입" ? "+" : "-"}${won(e.amount)}  ${e.name}${e.category ? ` [${e.category}]` : ""}${e.method ? ` · ${e.method}` : ""}`);
    }
    if (byDate.length === 0) lines.push("(기록 없음)");
    return lines.join("\n");
  };

  /* ── 공통 헤더 ── */
  const header = (
    <>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>💸 지출계획표 · 가계부</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            {SCOPES.find((s) => s.key === scope)!.desc} · <span style={{ color: GREEN }}>DB 공유</span>
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <CopyForKakaoButton text={tab === "plan" ? planText : ledgerText} label="카톡 복사" share />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "inline-flex", gap: 4, padding: 3, border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--surface)" }}>
          {SCOPES.map((s) => (
            <button key={s.key} className="btn" style={{ ...smBtn, border: "none", ...(scope === s.key ? activeBtn : { background: "transparent" }) }} onClick={() => go({ s: s.key })}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <div style={{ display: "inline-flex", gap: 4, padding: 3, border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--surface)" }}>
          <button className="btn" style={{ ...smBtn, border: "none", ...(tab === "plan" ? activeBtn : { background: "transparent" }) }} onClick={() => go({ tab: "plan" })}>📋 지출계획 (고정비·변동비)</button>
          <button className="btn" style={{ ...smBtn, border: "none", ...(tab === "ledger" ? activeBtn : { background: "transparent" }) }} onClick={() => go({ tab: "ledger" })}>📒 가계부 (일별 수입·지출)</button>
        </div>
      </div>

      <div className="card" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" style={smBtn} onClick={() => go({ m: prevMonth })} aria-label="이전 달">◀</button>
        <select value={months.includes(month) ? month : "__cur"} onChange={(e) => go({ m: e.target.value === "__cur" ? month : e.target.value })} style={{ ...inputStyle, width: "auto", fontWeight: 700, padding: "6px 10px" }}>
          {!months.includes(month) && <option value="__cur">{monthLabel(month)}</option>}
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <button className="btn" style={smBtn} onClick={() => go({ m: nextMonth })} aria-label="다음 달">▶</button>
        {month !== thisMonth && <button className="btn" style={smBtn} onClick={() => go({ m: thisMonth })}>이번 달</button>}
        <span style={{ flex: 1 }} />
        {tab === "plan" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
            <span className="muted">{monthLabel(prevMonth)}에서 복사:</span>
            {KINDS.map((k) => (
              <label key={k.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={copyKinds.includes(k.key)} onChange={(e) => setCopyKinds((p) => (e.target.checked ? Array.from(new Set([...p, k.key])) : p.filter((x) => x !== k.key)))} />
                {k.label}
              </label>
            ))}
            <button className="btn" style={smBtn} disabled={pending || copyKinds.length === 0} onClick={copyPrev}>📋 가져오기</button>
            {ledgerReady && <button className="btn" style={smBtn} disabled={pending} onClick={applyLedger} title="가계부에서 계획 항목에 연결된 지출 합계를 ‘실제’에 반영">📒 가계부 → 실제 반영</button>}
          </div>
        )}
      </div>

      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: RED, background: "var(--owner-bg, #fef2f2)" }}>{err}</div>}
      {notice && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--ink-2)" }}>{notice}</div>}
    </>
  );

  if (!dbReady) {
    return (
      <div>
        <h1>💸 지출계획표 · 가계부</h1>
        <DbSetupNotice title="지출계획표·가계부 (회사/개인 · 고정비/변동비)" sql={`${PLAN_SQL}\n\n${LEDGER_SQL}`} />
      </div>
    );
  }

  /* ───────── 가계부 탭 ───────── */
  if (tab === "ledger") {
    const defaultDate = month === thisMonth ? today : `${month}-01`;
    const planOptions = plans;
    return (
      <div>
        {header}
        {!ledgerReady ? (
          <DbSetupNotice title="가계부 (일별 수입·지출 장부)" sql={LEDGER_SQL} />
        ) : (
          <>
            {!photosReady && (
              <div style={{ marginBottom: 14 }}>
                <DbSetupNotice title="가계부 영수증 사진 첨부" sql={PHOTOS_SQL} />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
              <Stat label="이달 수입" value={won(income)} color={GREEN} />
              <Stat label="이달 지출" value={won(expense)} color={RED} />
              <Stat label="잔액 (수입 − 지출)" value={signed(income - expense)} accent />
              <Stat label="지출계획 대비" value={totalP ? `${won(expense)} / ${won(totalP)}` : "계획 없음"} sub={totalP ? `${Math.round((expense / totalP) * 100)}% 사용` : undefined} color={totalP && expense > totalP ? RED : undefined} />
              <Stat label="기록 건수" value={`${ledger.length}건`} />
            </div>

            <LedgerForm key={`new-${month}-${scope}`} scope={scope} initial={emptyLedger(scope, defaultDate)} plans={planOptions} pending={pending || upBusy} photos={photosReady} onBusy={setUpBusy} onSave={(inp) => saveLedger(inp)} />

            {byCategory.length > 0 && (
              <div className="card" style={{ padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>카테고리별 지출</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "6px 18px" }}>
                  {byCategory.map(([c, v]) => (
                    <div key={c} style={{ fontSize: 12.5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{c}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{won(v)} <span className="muted">({Math.round((v / Math.max(1, expense)) * 100)}%)</span></span>
                      </div>
                      <div style={{ height: 5, background: "var(--line)", borderRadius: 3, marginTop: 3 }}>
                        <div style={{ width: `${Math.round((v / Math.max(1, byCategory[0][1])) * 100)}%`, height: "100%", background: "var(--accent)", borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {byDate.length === 0 && (
              <div className="card muted" style={{ padding: 24, textAlign: "center" }}>{monthLabel(month)} 기록이 없습니다. 위에서 첫 기록을 추가하세요.</div>
            )}
            {byDate.map(([d, list]) => {
              const dayExp = list.filter((e) => e.type === "지출").reduce((s, e) => s + e.amount, 0);
              const dayInc = list.filter((e) => e.type === "수입").reduce((s, e) => s + e.amount, 0);
              return (
                <div key={d} className="card" style={{ marginBottom: 10, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "var(--surface-2)", fontSize: 13 }}>
                    <b>{dateLabel(d)}{d === today ? " · 오늘" : ""}</b>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {dayInc > 0 && <span style={{ color: GREEN, marginRight: 10 }}>+{won(dayInc)}</span>}
                      <span style={{ color: RED }}>-{won(dayExp)}</span>
                    </span>
                  </div>
                  {list.map((e) => {
                    const linked = e.planId ? plans.find((p) => p.id === e.planId) : null;
                    return (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div>
                          <div className="muted" style={{ fontSize: 11.5, marginTop: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {e.category && <span>{e.category}</span>}
                            {e.method && <span>· {e.method}</span>}
                            {e.brand && <span>· {e.brand}</span>}
                            {linked && <span style={{ color: "var(--accent)" }}>· 📋 {linked.name}</span>}
                          </div>
                          {e.memo && <div className="muted" style={{ fontSize: 12, marginTop: 2, whiteSpace: "pre-wrap" }}>{e.memo}</div>}
                          {(e.photos?.length ?? 0) > 0 && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                              {e.photos!.map((u) => (
                                <a key={u} href={u} target="_blank" rel="noreferrer" title="영수증 크게 보기">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={u} alt="영수증" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: e.type === "수입" ? GREEN : "var(--ink)", minWidth: 96, textAlign: "right" }}>
                          {e.type === "수입" ? "+" : "-"}{won(e.amount)}
                        </div>
                        <div style={{ whiteSpace: "nowrap" }}>
                          <button className="btn" style={smBtn} onClick={() => setLedgerEdit(e)}>수정</button>
                          <button className="btn" style={{ ...smBtn, marginLeft: 4, color: RED }} onClick={() => removeLedger(e)}>삭제</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}

        {ledgerEdit && (
          <div style={backdrop} onMouseDown={() => setLedgerEdit(null)}>
            <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
              <h2 style={{ marginTop: 0, fontSize: 17 }}>가계부 기록 수정</h2>
              <LedgerForm scope={scope} initial={ledgerEdit} plans={planOptions} pending={pending || upBusy} photos={photosReady} onBusy={setUpBusy} inline onSave={(inp) => saveLedger(inp, ledgerEdit.id)} onCancel={() => setLedgerEdit(null)} />
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ───────── 지출계획 탭 ───────── */
  return (
    <div>
      {header}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="고정비 계획 / 실제" value={`${won(fixedP)} / ${won(fixedA)}`} />
        <Stat label="변동비 계획 / 실제" value={`${won(varP)} / ${won(varA)}`} />
        <Stat label="총 계획" value={won(totalP)} accent />
        <Stat label="총 실제 지출" value={won(totalA)} accent />
        <Stat label={diff >= 0 ? "잔여 (계획 − 실제)" : "초과 지출"} value={`${diff < 0 ? "-" : ""}${won(Math.abs(diff))}`} color={diff < 0 ? RED : undefined} />
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
                <div className="muted" style={{ fontSize: 12 }}>{k.desc[scope]}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13 }}>계획 <b>{won(p)}</b> · 실제 <b style={{ color: a > p ? RED : "var(--ink)" }}>{won(a)}</b></span>
                <button className="btn" style={{ ...smBtn, ...activeBtn }} onClick={() => setPlanModal({ kind: k.key, edit: null })}>+ {k.label} 추가</button>
              </div>
            </div>

            <div className="card" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 760 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
                    <th style={{ ...th, width: 56 }}></th>
                    <th style={th}>항목</th>
                    <th style={th}>카테고리</th>
                    {scope === "회사" && <th style={th}>브랜드</th>}
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
                    const lsum = ledgerByPlan.get(r.id);
                    return (
                      <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <button className="btn" style={{ padding: "1px 5px", fontSize: 11 }} disabled={i === 0 || pending} onClick={() => moveRow(k.key, i, -1)} aria-label="위로">▲</button>
                          <button className="btn" style={{ padding: "1px 5px", fontSize: 11, marginLeft: 2 }} disabled={i === list.length - 1 || pending} onClick={() => moveRow(k.key, i, 1)} aria-label="아래로">▼</button>
                        </td>
                        <td data-label="항목" style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                        <td data-label="카테고리" style={{ ...td, color: "var(--ink-2)" }}>{r.category || "-"}</td>
                        {scope === "회사" && <td data-label="브랜드" style={{ ...td, color: "var(--ink-2)" }}>{r.brand || "-"}</td>}
                        <td data-label="지급일" style={{ ...td, textAlign: "center" }}>{r.dueDay ? `${r.dueDay}일` : "-"}</td>
                        <td data-label="계획" style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{won(r.planned)}</td>
                        <td data-label="실제" style={{ ...td, textAlign: "right" }}>
                          <ActualInput value={r.actual} onCommit={(v) => setActual(r, v)} />
                          {lsum != null && lsum !== r.actual && (
                            <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2, whiteSpace: "nowrap" }}>📒 가계부 {won(lsum)}</div>
                          )}
                        </td>
                        <td data-label="차이" style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: d < 0 ? RED : d > 0 ? GREEN : "var(--ink-2)" }}>
                          {r.actual ? signed(d) : "-"}
                        </td>
                        <td data-label="메모" style={{ ...td, color: "var(--ink-2)", maxWidth: 220, whiteSpace: "pre-wrap", fontSize: 12.5 }}>{r.memo || ""}</td>
                        <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                          <button className="btn" style={smBtn} onClick={() => setPlanModal({ kind: k.key, edit: r })}>수정</button>
                          <button className="btn" style={{ ...smBtn, marginLeft: 4, color: RED }} onClick={() => removePlan(r)}>삭제</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {list.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--line-2)", fontWeight: 700 }}>
                      <td style={td} colSpan={scope === "회사" ? 5 : 4}>{k.label} 합계</td>
                      <td style={{ ...td, textAlign: "right" }}>{won(p)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{won(a)}</td>
                      <td style={{ ...td, textAlign: "right", color: p - a < 0 ? RED : "var(--ink)" }}>{a ? signed(p - a) : "-"}</td>
                      <td style={td} colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        );
      })}

      {planModal && (
        <PlanModal
          scope={scope}
          month={month}
          kind={planModal.kind}
          initial={planModal.edit}
          pending={pending}
          onClose={() => setPlanModal(null)}
          onSave={(inp) => savePlan(inp, planModal.edit?.id)}
        />
      )}
    </div>
  );
}

/* ───────── 부품 ───────── */

function ActualInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value ? String(value) : "");
  useEffect(() => {
    setV(value ? String(value) : "");
  }, [value]);
  const commit = () => onCommit(Math.max(0, Math.round(Number(v.replace(/[^\d.]/g, "")) || 0)));
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

function Stat({ label, value, sub, accent, color }: { label: string; value: string; sub?: string; accent?: boolean; color?: string }) {
  return (
    <div className="card" style={{ padding: "12px 14px" }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2, color: color ?? (accent ? "var(--accent)" : "var(--ink)"), fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function PlanModal({
  scope,
  month,
  kind,
  initial,
  pending,
  onClose,
  onSave,
}: {
  scope: ExpenseScope;
  month: string;
  kind: ExpenseKind;
  initial: ExpensePlan | null;
  pending: boolean;
  onClose: () => void;
  onSave: (inp: ExpensePlanInput) => void;
}) {
  const [f, setF] = useState<ExpensePlanInput>(initial ? { ...initial } : emptyPlan(scope, month, kind));
  const set = (k: keyof ExpensePlanInput, v: any) => setF((p) => ({ ...p, [k]: v }));
  const listId = `plan-cat-${scope}-${f.kind}`;

  return (
    <div style={backdrop} onMouseDown={onClose}>
      <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ marginTop: 0, fontSize: 17 }}>
          {initial ? "지출 항목 수정" : `${f.kind === "고정" ? "고정비" : "변동비"} 항목 추가`}{" "}
          <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· {scope} · {monthLabel(f.month)}</span>
        </h2>

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {KINDS.map((k) => (
            <button key={k.key} type="button" className="btn" style={{ ...smBtn, ...(f.kind === k.key ? activeBtn : {}) }} onClick={() => set("kind", k.key)}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>

        <label className="field"><span>항목명 *</span>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={scope === "회사" ? "예: 사무실 임대료, 메타 광고비" : "예: 월세, 자동차 보험, 식비"} autoFocus style={inputStyle} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: scope === "회사" ? "1fr 1fr" : "1fr", gap: 10 }}>
          <label className="field"><span>카테고리</span>
            <input list={listId} value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="선택 또는 입력" style={inputStyle} />
            <datalist id={listId}>
              {PLAN_CAT[scope][f.kind].map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          {scope === "회사" && (
            <label className="field"><span>브랜드</span>
              <select value={f.brand} onChange={(e) => set("brand", e.target.value)} style={inputStyle}>
                <option value="">-</option>
                {TAG_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
          )}
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

function LedgerForm({
  scope,
  initial,
  plans,
  pending,
  inline,
  photos = true,
  onBusy,
  onSave,
  onCancel,
}: {
  scope: ExpenseScope;
  initial: LedgerInput;
  plans: ExpensePlan[];
  pending: boolean;
  inline?: boolean;
  photos?: boolean;
  onBusy?: (b: boolean) => void;
  onSave: (inp: LedgerInput) => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<LedgerInput>({ ...initial });
  const set = (k: keyof LedgerInput, v: any) => setF((p) => ({ ...p, [k]: v }));
  const listId = `ledger-cat-${scope}-${f.type}-${inline ? "e" : "n"}`;
  const isNew = !onCancel;
  const submit = () => {
    if (!f.name.trim() || !(Number(f.amount) > 0)) return;
    onSave({ ...f, amount: Number(f.amount) || 0 });
    if (isNew) setF((p) => ({ ...initial, date: p.date, type: p.type, method: p.method, photos: [] }));
  };
  const planOpts = plans;

  return (
    <div className={inline ? undefined : "card"} style={inline ? undefined : { padding: 14, marginBottom: 14 }}>
      {!inline && <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>➕ 기록 추가</div>}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {(["지출", "수입"] as LedgerType[]).map((t) => (
          <button key={t} type="button" className="btn" style={{ ...smBtn, ...(f.type === t ? { ...activeBtn, ...(t === "수입" ? { background: GREEN, borderColor: GREEN } : {}) } : {}) }} onClick={() => set("type", t)}>
            {t === "지출" ? "➖ 지출" : "➕ 수입"}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <label className="field" style={{ margin: 0 }}><span>날짜</span>
          <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} style={inputStyle} />
        </label>
        <label className="field" style={{ margin: 0, gridColumn: "span 2" }}><span>내용 *</span>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={f.type === "수입" ? "예: 9월 급여, 정산금 입금" : scope === "회사" ? "예: 메타 광고비, 택배비" : "예: 점심, 마트 장보기"} style={inputStyle}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </label>
        <label className="field" style={{ margin: 0 }}><span>금액(원) *</span>
          <input type="number" min={0} step={100} inputMode="numeric" value={f.amount || ""} onChange={(e) => set("amount", Number(e.target.value) || 0)} placeholder="0" style={inputStyle}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </label>
        <label className="field" style={{ margin: 0 }}><span>카테고리</span>
          <input list={listId} value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="선택 또는 입력" style={inputStyle} />
          <datalist id={listId}>
            {LEDGER_CAT[scope][f.type].map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <label className="field" style={{ margin: 0 }}><span>{f.type === "수입" ? "입금 수단" : "결제 수단"}</span>
          <select value={f.method} onChange={(e) => set("method", e.target.value)} style={inputStyle}>
            <option value="">-</option>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        {scope === "회사" && (
          <label className="field" style={{ margin: 0 }}><span>브랜드</span>
            <select value={f.brand} onChange={(e) => set("brand", e.target.value)} style={inputStyle}>
              <option value="">-</option>
              {TAG_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        )}
        {f.type === "지출" && planOpts.length > 0 && (
          <label className="field" style={{ margin: 0 }}><span>연결 계획 항목</span>
            <select value={f.planId ?? ""} onChange={(e) => set("planId", e.target.value || null)} style={inputStyle}>
              <option value="">- (연결 안 함)</option>
              {planOpts.map((p) => <option key={p.id} value={p.id}>[{p.kind}] {p.name}</option>)}
            </select>
          </label>
        )}
        <label className="field" style={{ margin: 0, gridColumn: "1 / -1" }}><span>메모</span>
          <input value={f.memo} onChange={(e) => set("memo", e.target.value)} placeholder="선택" style={inputStyle} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </label>
      </div>
      {photos && (
        <div style={{ marginTop: 10 }}>
          <PhotoPicker label="🧾 영수증 사진" folder="ledger" urls={f.photos ?? []} onChange={(next) => set("photos", next)} onBusy={onBusy} max={10} compact />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        {onCancel && <button className="btn" onClick={onCancel} disabled={pending}>취소</button>}
        <button className="btn primary" disabled={pending || !f.name.trim() || !(Number(f.amount) > 0)} onClick={submit}>{pending ? "저장 중…" : isNew ? "기록 추가" : "저장"}</button>
      </div>
    </div>
  );
}
