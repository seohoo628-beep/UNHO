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
  createRecurring,
  updateRecurring,
  toggleRecurring,
  deleteRecurring,
  applyRecurringNow,
  type RecurringInput,
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
  recurringId?: string | null;
}
export interface Recurring extends RecurringInput {
  id: string;
}

const RECURRING_SQL = `create table if not exists public.ledger_recurrings (
  id uuid primary key default gen_random_uuid(),
  scope text not null default '회사',
  type text not null default '지출',
  category text,
  name text not null,
  amount bigint not null default 0,
  method text,
  brand text,
  memo text,
  day_of_month int not null default 1,
  start_month text not null,
  end_month text,
  active boolean not null default true,
  skipped_months jsonb not null default '[]'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ledger_recurrings enable row level security;
drop policy if exists ledger_recurrings_all on public.ledger_recurrings;
create policy ledger_recurrings_all on public.ledger_recurrings for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
alter table public.ledger_entries add column if not exists recurring_id uuid references public.ledger_recurrings(id) on delete set null;
alter table public.ledger_entries add column if not exists recurring_month text;
create unique index if not exists ledger_entries_recurring_uniq on public.ledger_entries(recurring_id, recurring_month) where recurring_id is not null;`;

type Tab = "dash" | "plan" | "ledger";

export type TrendPoint = { month: string; fixed: number; variable: number; actual: number; ledgerOut: number; ledgerIn: number };
export type DashData = { plans: ExpensePlan[]; ledger: LedgerEntry[]; trend: TrendPoint[] };

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

// CSV 다운로드(엑셀 호환 BOM 포함).
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ledgerCsvRows(entries: LedgerEntry[], plans: ExpensePlan[], withScope: boolean): (string | number)[][] {
  const head = [...(withScope ? ["구분"] : []), "날짜", "종류", "내용", "카테고리", "금액", "결제수단", "브랜드", "연결 계획항목", "메모", "영수증 사진"];
  const body = [...entries]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((e) => {
      const linked = e.planId ? plans.find((p) => p.id === e.planId)?.name ?? "" : "";
      return [
        ...(withScope ? [e.scope] : []),
        e.date, e.type, e.name, e.category, e.type === "수입" ? e.amount : -e.amount, e.method, e.brand, linked, e.memo, (e.photos ?? []).join(" "),
      ];
    });
  const inc = entries.filter((e) => e.type === "수입").reduce((s, e) => s + e.amount, 0);
  const out = entries.filter((e) => e.type === "지출").reduce((s, e) => s + e.amount, 0);
  const pad = (label: string, v: number) => [...(withScope ? [""] : []), "", "", label, "", v, "", "", "", "", ""];
  return [head, ...body, [], pad("수입 합계", inc), pad("지출 합계", -out), pad("잔액", inc - out)];
}

function planCsvRows(plans: ExpensePlan[], withScope: boolean): (string | number)[][] {
  const head = [...(withScope ? ["구분"] : []), "종류", "항목", "카테고리", "브랜드", "지급일", "계획", "실제", "차이", "메모"];
  const body = [...plans]
    .sort((a, b) => (a.kind === b.kind ? a.sortOrder - b.sortOrder : a.kind === "고정" ? -1 : 1))
    .map((p) => [...(withScope ? [p.scope] : []), p.kind === "고정" ? "고정비" : "변동비", p.name, p.category, p.brand, p.dueDay ?? "", p.planned, p.actual, p.planned - p.actual, p.memo]);
  const sum = (k: ExpenseKind, f: "planned" | "actual") => plans.filter((p) => p.kind === k).reduce((s, p) => s + p[f], 0);
  const tot = (label: string, pl: number, ac: number) => [...(withScope ? [""] : []), "", label, "", "", "", pl, ac, pl - ac, ""];
  return [head, ...body, [], tot("고정비 합계", sum("고정", "planned"), sum("고정", "actual")), tot("변동비 합계", sum("변동", "planned"), sum("변동", "actual")), tot("총 합계", sum("고정", "planned") + sum("변동", "planned"), sum("고정", "actual") + sum("변동", "actual"))];
}

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
  recurringReady = true,
  recurrings = [],
  dash = null,
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
  recurringReady?: boolean;
  recurrings?: Recurring[];
  dash?: DashData | null;
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
  const [recOpen, setRecOpen] = useState(false);
  const [recEdit, setRecEdit] = useState<Recurring | "new" | null>(null);

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
      if (r.error) setNotice(r.error); // 성공했지만 안내가 있는 경우
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
  const saveRecurring = (inp: RecurringInput, id?: string) =>
    run(
      () => (id ? updateRecurring(id, inp, month <= thisMonth ? month : undefined) : createRecurring(inp, month <= thisMonth ? month : undefined)),
      (r) => { setRecEdit(null); if (r.count) setNotice(`반복 규칙을 저장하고 ${monthLabel(month)} 기록 ${r.count}건을 자동 입력했습니다.`); }
    );
  const removeRecurring = (r: Recurring) => {
    if (!confirm(`반복 규칙 ‘${r.name}’을 삭제할까요? (이미 입력된 기록은 남습니다)`)) return;
    run(() => deleteRecurring(r.id));
  };
  const applyRecurring = () =>
    run(() => applyRecurringNow(month), (r) => setNotice(r.count ? `${monthLabel(month)} 반복 기록 ${r.count}건을 입력했습니다.` : "이달에 새로 입력할 반복 기록이 없습니다. (이미 입력됐거나 삭제한 달)"));

  const removeLedger = (e: LedgerEntry) => {
    if (!confirm(e.recurringId ? `‘${e.name}’ 기록을 삭제할까요?\n(반복 지출입니다. 이달 분만 삭제되고 다음 달부터는 계속 자동 입력됩니다)` : `‘${e.name}’ 기록을 삭제할까요?`)) return;
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

  /* ── 대시보드 집계 (회사+개인) ── */
  const monthChips = useMemo(() => {
    const set = new Set<string>();
    for (let i = 11; i >= 0; i--) {
      const [y, mo] = thisMonth.split("-").map(Number);
      const d = new Date(Date.UTC(y, mo - 1 - i, 1));
      set.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    for (const m of months) set.add(m);
    set.add(month);
    return Array.from(set).sort();
  }, [thisMonth, months, month]);

  const dashPlans = dash?.plans ?? [];
  const dashLedger = dash?.ledger ?? [];
  const agg = (list: ExpensePlan[], f: "planned" | "actual") => list.reduce((s, r) => s + (Number(r[f]) || 0), 0);
  const dashRows = SCOPES.map((sc) => {
    const ps = dashPlans.filter((p) => p.scope === sc.key);
    const ls = dashLedger.filter((l) => l.scope === sc.key);
    return {
      scope: sc,
      fixedP: agg(ps.filter((p) => p.kind === "고정"), "planned"),
      fixedA: agg(ps.filter((p) => p.kind === "고정"), "actual"),
      varP: agg(ps.filter((p) => p.kind === "변동"), "planned"),
      varA: agg(ps.filter((p) => p.kind === "변동"), "actual"),
      out: ls.filter((l) => l.type === "지출").reduce((s, l) => s + l.amount, 0),
      inc: ls.filter((l) => l.type === "수입").reduce((s, l) => s + l.amount, 0),
      items: ps.length,
      entries: ls.length,
    };
  });
  const dTotal = dashRows.reduce(
    (t, r) => ({ fixedP: t.fixedP + r.fixedP, fixedA: t.fixedA + r.fixedA, varP: t.varP + r.varP, varA: t.varA + r.varA, out: t.out + r.out, inc: t.inc + r.inc }),
    { fixedP: 0, fixedA: 0, varP: 0, varA: 0, out: 0, inc: 0 }
  );
  const dPlanned = dTotal.fixedP + dTotal.varP;
  const dActual = dTotal.fixedA + dTotal.varA;
  const dSpent = Math.max(dActual, dTotal.out);
  const dashCats = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of dashLedger) if (e.type === "지출") m.set(e.category || "미분류", (m.get(e.category || "미분류") ?? 0) + e.amount);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [dashLedger]);
  const dashPlanCats = useMemo(() => {
    const m = new Map<string, { planned: number; actual: number }>();
    for (const p of dashPlans) {
      const k = `${p.kind} · ${p.category || "미분류"}`;
      const o = m.get(k) ?? { planned: 0, actual: 0 };
      o.planned += p.planned; o.actual += p.actual; m.set(k, o);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].planned - a[1].planned);
  }, [dashPlans]);

  const dashText = () => {
    const lines: string[] = [`📊 ${monthLabel(month)} 지출 대시보드 (회사+개인)`, ""];
    for (const r of dashRows) {
      if (!r.items && !r.entries) continue;
      lines.push(`${r.scope.icon} ${r.scope.label}  고정비 ${won(r.fixedP)} / 변동비 ${won(r.varP)} · 실제 ${won(r.fixedA + r.varA)} · 가계부 지출 ${won(r.out)}${r.inc ? ` · 수입 ${won(r.inc)}` : ""}`);
    }
    lines.push("", `합계  계획 ${won(dPlanned)}원 (고정 ${won(dTotal.fixedP)} + 변동 ${won(dTotal.varP)})`, `      지출 ${won(dSpent)}원 · ${dPlanned >= dSpent ? "잔여" : "초과"} ${won(Math.abs(dPlanned - dSpent))}원`);
    if (dashCats.length) {
      lines.push("", "카테고리별 지출");
      for (const [c, v] of dashCats) lines.push(`- ${c}: ${won(v)}`);
    }
    return lines.join("\n");
  };

  /* ── 공통 헤더 ── */
  const header = (
    <>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>💸 지출계획표 · 가계부</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            {tab === "dash" ? "회사 + 개인(본인) 이달 전체 현황" : SCOPES.find((s) => s.key === scope)!.desc} · <span style={{ color: GREEN }}>DB 공유</span>
            {pending ? " · 저장 중…" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <CopyForKakaoButton text={tab === "dash" ? dashText : tab === "plan" ? planText : ledgerText} label="카톡 복사" share />
          {tab === "ledger" && ledgerReady && (
            <button className="btn" disabled={ledger.length === 0} title="이달 가계부를 엑셀용 CSV로 저장" onClick={() => downloadCsv(`가계부_${scope}_${month}.csv`, ledgerCsvRows(ledger, plans, false))}>⬇ CSV</button>
          )}
          {tab === "plan" && (
            <button className="btn" disabled={plans.length === 0} title="이달 지출계획표를 엑셀용 CSV로 저장" onClick={() => downloadCsv(`지출계획표_${scope}_${month}.csv`, planCsvRows(plans, false))}>⬇ CSV</button>
          )}
          {tab === "dash" && (
            <>
              <button className="btn" disabled={dashLedger.length === 0} title="이달 가계부(회사+개인)를 CSV로 저장" onClick={() => downloadCsv(`가계부_전체_${month}.csv`, ledgerCsvRows(dashLedger, dashPlans, true))}>⬇ 가계부 CSV</button>
              <button className="btn" disabled={dashPlans.length === 0} title="이달 지출계획표(회사+개인)를 CSV로 저장" onClick={() => downloadCsv(`지출계획표_전체_${month}.csv`, planCsvRows(dashPlans, true))}>⬇ 계획표 CSV</button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "inline-flex", gap: 4, padding: 3, border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--surface)" }}>
          <button className="btn" style={{ ...smBtn, border: "none", ...(tab === "dash" ? activeBtn : { background: "transparent" }) }} onClick={() => go({ tab: "dash" })}>📊 대시보드</button>
          <button className="btn" style={{ ...smBtn, border: "none", ...(tab === "plan" ? activeBtn : { background: "transparent" }) }} onClick={() => go({ tab: "plan" })}>📋 지출계획 (고정비·변동비)</button>
          <button className="btn" style={{ ...smBtn, border: "none", ...(tab === "ledger" ? activeBtn : { background: "transparent" }) }} onClick={() => go({ tab: "ledger" })}>📒 가계부 (일별 수입·지출)</button>
        </div>
        {tab !== "dash" && (
          <div style={{ display: "inline-flex", gap: 4, padding: 3, border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--surface)" }}>
            {SCOPES.map((s) => (
              <button key={s.key} className="btn" style={{ ...smBtn, border: "none", ...(scope === s.key ? activeBtn : { background: "transparent" }) }} onClick={() => go({ s: s.key })}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        )}
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

      {tab === "dash" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {monthChips.map((m) => (
            <button key={m} className="btn" style={{ ...smBtn, ...(m === month ? activeBtn : {}), opacity: months.includes(m) || m === thisMonth || m === month ? 1 : 0.55 }} onClick={() => go({ m })} title={months.includes(m) ? "기록 있음" : "기록 없음"}>
              {m.slice(2, 4)}.{Number(m.slice(5, 7))}월{months.includes(m) ? " •" : ""}
            </button>
          ))}
        </div>
      )}

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

  /* ───────── 대시보드 탭 ───────── */
  if (tab === "dash") {
    const maxTrend = Math.max(1, ...(dash?.trend ?? []).map((t) => Math.max(t.fixed + t.variable, t.actual, t.ledgerOut)));
    const pct = dPlanned > 0 ? Math.min(100, Math.round((dSpent / dPlanned) * 100)) : 0;
    const over = dPlanned > 0 && dSpent > dPlanned;
    const recent = dashLedger.slice(0, 30);
    return (
      <div>
        {header}

        {/* 이달 총괄 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
          <Stat label="🏢 고정비 계획 / 실제" value={`${won(dTotal.fixedP)} / ${won(dTotal.fixedA)}`} />
          <Stat label="📈 변동비 계획 / 실제" value={`${won(dTotal.varP)} / ${won(dTotal.varA)}`} />
          <Stat label="총 계획" value={won(dPlanned)} accent />
          <Stat label="총 지출 (계획표 실제·가계부 중 큰 값)" value={won(dSpent)} color={over ? RED : undefined} sub={dPlanned ? `${pct}% 사용` : undefined} />
          <Stat label={over ? "초과 지출" : "잔여"} value={won(Math.abs(dPlanned - dSpent))} color={over ? RED : GREEN} />
          {dTotal.inc > 0 && <Stat label="가계부 수입" value={won(dTotal.inc)} color={GREEN} />}
        </div>
        {dPlanned > 0 && (
          <div className="card" style={{ padding: "10px 14px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
              <span>계획 대비 지출 진행률</span><b style={{ color: over ? RED : "var(--ink)" }}>{pct}%</b>
            </div>
            <div style={{ height: 10, background: "var(--line)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: over ? RED : pct >= 80 ? "var(--warn, #f59e0b)" : "var(--accent)" }} />
            </div>
          </div>
        )}

        {/* 회사 / 개인 분리 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 14 }}>
          {dashRows.map((r) => {
            const p = r.fixedP + r.varP;
            const a = r.fixedA + r.varA;
            const spent = Math.max(a, r.out);
            const sp = p > 0 ? Math.min(100, Math.round((spent / p) * 100)) : 0;
            const ov = p > 0 && spent > p;
            const sKey = r.scope.key === "개인" ? "personal" : "company";
            return (
              <div key={r.scope.key} className="card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15 }}>{r.scope.icon} {r.scope.label}</b>
                  <span className="muted" style={{ fontSize: 12 }}>{r.items}개 항목 · {r.entries}건 기록</span>
                </div>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <tbody>
                    <tr><td style={{ padding: "3px 0" }} className="muted">고정비</td><td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{won(r.fixedP)} <span className="muted">/ 실제 {won(r.fixedA)}</span></td></tr>
                    <tr><td style={{ padding: "3px 0" }} className="muted">변동비</td><td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{won(r.varP)} <span className="muted">/ 실제 {won(r.varA)}</span></td></tr>
                    <tr><td style={{ padding: "3px 0" }} className="muted">가계부 지출</td><td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{won(r.out)}</td></tr>
                    {r.inc > 0 && <tr><td style={{ padding: "3px 0" }} className="muted">가계부 수입</td><td style={{ textAlign: "right", color: GREEN, fontVariantNumeric: "tabular-nums" }}>+{won(r.inc)}</td></tr>}
                    <tr style={{ borderTop: "1px solid var(--line)", fontWeight: 700 }}><td style={{ padding: "5px 0" }}>계획 합계 / 지출</td><td style={{ textAlign: "right", color: ov ? RED : "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{won(p)} / {won(spent)}{p > 0 ? ` (${sp}%)` : ""}</td></tr>
                  </tbody>
                </table>
                {p > 0 && (
                  <div style={{ height: 6, background: "var(--line)", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                    <div style={{ width: `${sp}%`, height: "100%", background: ov ? RED : sp >= 80 ? "var(--warn, #f59e0b)" : "var(--accent)" }} />
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button className="btn" style={smBtn} onClick={() => go({ s: r.scope.key, tab: "plan" })}>📋 지출계획 보기</button>
                  <button className="btn" style={smBtn} onClick={() => go({ s: r.scope.key, tab: "ledger" })}>📒 가계부 보기</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 최근 6개월 추이 */}
        {(dash?.trend?.length ?? 0) > 0 && (
          <div className="card" style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>최근 6개월 추이 <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· 막대: 계획(고정+변동) / 점: 지출</span></div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${dash!.trend.length}, 1fr)`, gap: 8, alignItems: "end", height: 120 }}>
              {dash!.trend.map((t) => {
                const plan = t.fixed + t.variable;
                const spent = Math.max(t.actual, t.ledgerOut);
                const hPlan = Math.round((plan / maxTrend) * 100);
                const hSpent = Math.round((spent / maxTrend) * 100);
                const on = t.month === month;
                return (
                  <button key={t.month} onClick={() => go({ m: t.month })} title={`${monthLabel(t.month)} · 계획 ${won(plan)} · 지출 ${won(spent)}`} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                    <div style={{ position: "relative", width: "100%", maxWidth: 46, height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                      <div style={{ width: "60%", height: `${hPlan}%`, background: on ? "var(--accent)" : "var(--line-2)", borderRadius: "4px 4px 0 0", minHeight: plan ? 3 : 0 }} />
                      {spent > 0 && <div style={{ position: "absolute", bottom: `calc(${hSpent}% - 4px)`, width: 8, height: 8, borderRadius: 4, background: spent > plan && plan > 0 ? RED : GREEN, border: "1.5px solid var(--surface)" }} />}
                    </div>
                    <span style={{ fontSize: 11, color: on ? "var(--accent)" : "var(--ink-2)", fontWeight: on ? 700 : 400 }}>{Number(t.month.slice(5, 7))}월</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 카테고리 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 14 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>📋 계획 항목별 (고정·변동 × 카테고리)</div>
            {dashPlanCats.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>이달 계획 항목이 없습니다.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {dashPlanCats.map(([k, v]) => (
                  <div key={k} style={{ fontSize: 12.5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{k}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{won(v.planned)} <span className="muted">/ 실제 {won(v.actual)}</span></span>
                    </div>
                    <div style={{ height: 5, background: "var(--line)", borderRadius: 3, marginTop: 3, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((v.planned / Math.max(1, dashPlanCats[0][1].planned)) * 100)}%`, height: "100%", background: k.startsWith("고정") ? "var(--accent)" : "var(--warn, #f59e0b)" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>📒 가계부 카테고리별 지출</div>
            {dashCats.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>이달 가계부 지출 기록이 없습니다.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {dashCats.map(([c, v]) => (
                  <div key={c} style={{ fontSize: 12.5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{c}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{won(v)} <span className="muted">({Math.round((v / Math.max(1, dTotal.out)) * 100)}%)</span></span>
                    </div>
                    <div style={{ height: 5, background: "var(--line)", borderRadius: 3, marginTop: 3, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((v / Math.max(1, dashCats[0][1])) * 100)}%`, height: "100%", background: "var(--accent)" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 지출 내역 */}
        <div className="card" style={{ overflow: "hidden", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--surface-2)" }}>
            <b style={{ fontSize: 13.5 }}>📒 {monthLabel(month)} 지출·수입 내역 <span className="muted" style={{ fontWeight: 400 }}>{dashLedger.length}건</span></b>
            <span style={{ display: "flex", gap: 6 }}>
              <button className="btn" style={smBtn} onClick={() => go({ s: "회사", tab: "ledger" })}>🏢 회사 가계부</button>
              <button className="btn" style={smBtn} onClick={() => go({ s: "개인", tab: "ledger" })}>🙋 개인 가계부</button>
            </span>
          </div>
          {recent.length === 0 && <div className="muted" style={{ padding: 20, textAlign: "center", fontSize: 13 }}>기록이 없습니다. 가계부 탭에서 지출을 입력하세요.</div>}
          {recent.map((e) => {
            const linked = e.planId ? dashPlans.find((p) => p.id === e.planId) : null;
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderTop: "1px solid var(--line)", fontSize: 13 }}>
                <span className="muted" style={{ width: 52, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{Number(e.date.slice(5, 7))}/{Number(e.date.slice(8, 10))}</span>
                <span style={{ flexShrink: 0, fontSize: 11.5, padding: "1px 6px", borderRadius: 6, background: "var(--surface-2)" }}>{e.scope === "개인" ? "🙋" : "🏢"}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.name}
                  <span className="muted" style={{ fontSize: 11.5 }}>{e.category ? ` · ${e.category}` : ""}{e.method ? ` · ${e.method}` : ""}{linked ? ` · 📋 ${linked.name}` : ""}</span>
                </span>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: e.type === "수입" ? GREEN : "var(--ink)", flexShrink: 0 }}>{e.type === "수입" ? "+" : "-"}{won(e.amount)}</span>
              </div>
            );
          })}
          {dashLedger.length > recent.length && <div className="muted" style={{ padding: "8px 14px", fontSize: 12, borderTop: "1px solid var(--line)" }}>외 {dashLedger.length - recent.length}건 — 가계부 탭에서 전체 보기</div>}
        </div>

        {/* 계획 항목 전체 (고정비·변동비) */}
        {KINDS.map((k) => {
          const list = dashPlans.filter((p) => p.kind === k.key);
          if (list.length === 0) return null;
          const p = agg(list, "planned"); const a = agg(list, "actual");
          return (
            <div key={k.key} className="card" style={{ overflowX: "auto", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--surface-2)" }}>
                <b style={{ fontSize: 13.5 }}>{k.icon} {k.label} 전체 <span className="muted" style={{ fontWeight: 400 }}>{list.length}건</span></b>
                <span style={{ fontSize: 12.5 }}>계획 <b>{won(p)}</b> · 실제 <b style={{ color: a > p ? RED : "var(--ink)" }}>{won(a)}</b></span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--ink-2)" }}>
                    <th style={th}>구분</th><th style={th}>항목</th><th style={th}>카테고리</th><th style={{ ...th, textAlign: "center" }}>지급일</th><th style={{ ...th, textAlign: "right" }}>계획</th><th style={{ ...th, textAlign: "right" }}>실제</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={td}>{r.scope === "개인" ? "🙋 개인" : "🏢 회사"}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                      <td style={{ ...td, color: "var(--ink-2)" }}>{r.category || "-"}{r.brand ? ` · ${r.brand}` : ""}</td>
                      <td style={{ ...td, textAlign: "center" }}>{r.dueDay ? `${r.dueDay}일` : "-"}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{won(r.planned)}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.actual > r.planned ? RED : "var(--ink)" }}>{r.actual ? won(r.actual) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
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
            {!recurringReady && (
              <div style={{ marginBottom: 14 }}>
                <DbSetupNotice title="가계부 반복 지출 (매월 자동 입력)" sql={RECURRING_SQL} />
              </div>
            )}
            {recurringReady && (
              <div className="card" style={{ padding: "10px 14px", marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" style={{ ...smBtn, border: "none", background: "transparent", padding: 0, fontWeight: 700, fontSize: 13.5 }} onClick={() => setRecOpen((v) => !v)}>
                    {recOpen ? "▾" : "▸"} 🔁 반복 지출·수입 <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{recurrings.filter((r) => r.active).length}개 활성{recurrings.length > recurrings.filter((r) => r.active).length ? ` · ${recurrings.length - recurrings.filter((r) => r.active).length}개 중지` : ""}</span>
                  </button>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {month <= thisMonth && <button className="btn" style={smBtn} disabled={pending || recurrings.length === 0} onClick={applyRecurring} title="이달 분이 아직 입력되지 않은 반복 규칙을 지금 입력">⟳ 이달 분 입력</button>}
                    <button className="btn" style={{ ...smBtn, ...activeBtn }} onClick={() => { setRecOpen(true); setRecEdit("new"); }}>+ 반복 규칙</button>
                  </span>
                </div>
                {recOpen && (
                  <div style={{ marginTop: 10 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>매월 지정한 날짜에 가계부 기록이 자동으로 들어갑니다(매일 아침 자동 실행 + 해당 월을 열 때). 자동 입력된 기록은 🔁 표시가 붙고, 보통 기록처럼 수정·삭제할 수 있습니다.</div>
                    {recurrings.length === 0 && <div className="muted" style={{ fontSize: 12.5, padding: "6px 0" }}>등록된 반복 규칙이 없습니다. 기록 추가 폼의 「매월 반복」을 켜거나 「+ 반복 규칙」으로 등록하세요.</div>}
                    {recurrings.map((r) => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid var(--line)", fontSize: 13, opacity: r.active ? 1 : 0.55, flexWrap: "wrap" }}>
                        <span style={{ width: 56, flexShrink: 0, fontVariantNumeric: "tabular-nums" }} className="muted">매월 {r.dayOfMonth}일</span>
                        <span style={{ flex: 1, minWidth: 140 }}>
                          <b>{r.name}</b>
                          <span className="muted" style={{ fontSize: 11.5 }}>{r.category ? ` · ${r.category}` : ""}{r.method ? ` · ${r.method}` : ""}{r.brand ? ` · ${r.brand}` : ""} · {r.startMonth}부터{r.endMonth ? ` ${r.endMonth}까지` : ""}</span>
                        </span>
                        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: r.type === "수입" ? GREEN : "var(--ink)" }}>{r.type === "수입" ? "+" : "-"}{won(r.amount)}</span>
                        <span style={{ whiteSpace: "nowrap" }}>
                          <button className="btn" style={smBtn} onClick={() => run(() => toggleRecurring(r.id, !r.active))}>{r.active ? "중지" : "재개"}</button>
                          <button className="btn" style={{ ...smBtn, marginLeft: 4 }} onClick={() => setRecEdit(r)}>수정</button>
                          <button className="btn" style={{ ...smBtn, marginLeft: 4, color: RED }} onClick={() => removeRecurring(r)}>삭제</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
              <Stat label="이달 수입" value={won(income)} color={GREEN} />
              <Stat label="이달 지출" value={won(expense)} color={RED} />
              <Stat label="잔액 (수입 − 지출)" value={signed(income - expense)} accent />
              <Stat label="지출계획 대비" value={totalP ? `${won(expense)} / ${won(totalP)}` : "계획 없음"} sub={totalP ? `${Math.round((expense / totalP) * 100)}% 사용` : undefined} color={totalP && expense > totalP ? RED : undefined} />
              <Stat label="기록 건수" value={`${ledger.length}건`} />
            </div>

            <LedgerForm key={`new-${month}-${scope}`} scope={scope} initial={emptyLedger(scope, defaultDate)} plans={planOptions} pending={pending || upBusy} photos={photosReady} repeatOption={recurringReady} onBusy={setUpBusy} onSave={(inp) => saveLedger(inp)} />

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
                            {e.recurringId && <span title="반복 지출(자동 입력)">· 🔁 반복</span>}
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

        {recEdit && (
          <div style={backdrop} onMouseDown={() => setRecEdit(null)}>
            <div className="card" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 20, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
              <h2 style={{ marginTop: 0, fontSize: 17 }}>🔁 {recEdit === "new" ? "반복 규칙 추가" : "반복 규칙 수정"} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· {scope}</span></h2>
              <RecurringForm
                scope={scope}
                initial={recEdit === "new" ? { scope, type: "지출", category: "", name: "", amount: 0, method: "자동이체", brand: "", memo: "", dayOfMonth: 1, startMonth: month, endMonth: "", active: true } : recEdit}
                pending={pending}
                onSave={(inp) => saveRecurring(inp, recEdit === "new" ? undefined : recEdit.id)}
                onCancel={() => setRecEdit(null)}
              />
            </div>
          </div>
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
  repeatOption = false,
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
  repeatOption?: boolean;
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
    if (isNew) setF((p) => ({ ...initial, date: p.date, type: p.type, method: p.method, photos: [], repeatMonthly: false }));
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
      {repeatOption && isNew && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 13 }}>
          <input type="checkbox" checked={!!f.repeatMonthly} onChange={(e) => set("repeatMonthly", e.target.checked)} />
          🔁 매월 반복 <span className="muted" style={{ fontSize: 12 }}>— 매월 {Number(f.date.slice(8, 10)) || 1}일에 같은 내용·금액으로 자동 입력 (반복 규칙 목록에서 수정·중지 가능)</span>
        </label>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        {onCancel && <button className="btn" onClick={onCancel} disabled={pending}>취소</button>}
        <button className="btn primary" disabled={pending || !f.name.trim() || !(Number(f.amount) > 0)} onClick={submit}>{pending ? "저장 중…" : isNew ? "기록 추가" : "저장"}</button>
      </div>
    </div>
  );
}

function RecurringForm({ scope, initial, pending, onSave, onCancel }: { scope: ExpenseScope; initial: RecurringInput; pending: boolean; onSave: (inp: RecurringInput) => void; onCancel: () => void }) {
  const [f, setF] = useState<RecurringInput>({ ...initial });
  const set = (k: keyof RecurringInput, v: any) => setF((p) => ({ ...p, [k]: v }));
  const listId = `rec-cat-${scope}-${f.type}`;
  const ok = f.name.trim() && Number(f.amount) > 0 && /^\d{4}-\d{2}$/.test(f.startMonth) && (!f.endMonth || /^\d{4}-\d{2}$/.test(f.endMonth));
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {(["지출", "수입"] as LedgerType[]).map((t) => (
          <button key={t} type="button" className="btn" style={{ ...smBtn, ...(f.type === t ? { ...activeBtn, ...(t === "수입" ? { background: GREEN, borderColor: GREEN } : {}) } : {}) }} onClick={() => set("type", t)}>
            {t === "지출" ? "➖ 지출" : "➕ 수입"}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <label className="field" style={{ margin: 0, gridColumn: "span 2" }}><span>내용 *</span>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={f.type === "수입" ? "예: 월급, 임대 수입" : "예: 사무실 월세, 넷플릭스, 보험료"} style={inputStyle} autoFocus />
        </label>
        <label className="field" style={{ margin: 0 }}><span>금액(원) *</span>
          <input type="number" min={0} step={1000} inputMode="numeric" value={f.amount || ""} onChange={(e) => set("amount", Number(e.target.value) || 0)} placeholder="0" style={inputStyle} />
        </label>
        <label className="field" style={{ margin: 0 }}><span>매월 며칠</span>
          <input type="number" min={1} max={31} value={f.dayOfMonth} onChange={(e) => set("dayOfMonth", Math.min(31, Math.max(1, Number(e.target.value) || 1)))} style={inputStyle} />
        </label>
        <label className="field" style={{ margin: 0 }}><span>카테고리</span>
          <input list={listId} value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="선택 또는 입력" style={inputStyle} />
          <datalist id={listId}>{LEDGER_CAT[scope][f.type].map((c) => <option key={c} value={c} />)}</datalist>
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
        <label className="field" style={{ margin: 0 }}><span>시작월</span>
          <input type="month" value={f.startMonth} onChange={(e) => set("startMonth", e.target.value)} style={inputStyle} />
        </label>
        <label className="field" style={{ margin: 0 }}><span>종료월 <span className="muted">(비우면 계속)</span></span>
          <input type="month" value={f.endMonth} onChange={(e) => set("endMonth", e.target.value)} style={inputStyle} />
        </label>
        <label className="field" style={{ margin: 0, gridColumn: "1 / -1" }}><span>메모</span>
          <input value={f.memo} onChange={(e) => set("memo", e.target.value)} placeholder="선택" style={inputStyle} />
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 13 }}>
        <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> 활성 (끄면 자동 입력 중지)
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={onCancel} disabled={pending}>취소</button>
        <button className="btn primary" disabled={pending || !ok} onClick={() => onSave({ ...f, amount: Number(f.amount) || 0 })}>{pending ? "저장 중…" : "저장"}</button>
      </div>
    </div>
  );
}
