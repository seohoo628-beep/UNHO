"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { entryDateFor, isMissingRecurring, materializeRecurring } from "@/lib/ledgerRecurring";

type Result = { ok: boolean; error?: string; count?: number };

export type ExpenseKind = "고정" | "변동";
export type ExpenseScope = "회사" | "개인";
export type LedgerType = "지출" | "수입";

export interface ExpensePlanInput {
  scope: ExpenseScope;
  month: string; // YYYY-MM
  kind: ExpenseKind;
  category: string;
  name: string;
  planned: number;
  actual: number;
  dueDay: number | null;
  brand: string;
  memo: string;
}

export interface LedgerInput {
  scope: ExpenseScope;
  date: string; // YYYY-MM-DD
  type: LedgerType;
  category: string;
  name: string;
  amount: number;
  method: string;
  brand: string;
  memo: string;
  planId: string | null;
  photos?: string[]; // 영수증 사진 URL
  repeatMonthly?: boolean; // 새 기록 저장 시 "매월 반복" 규칙도 함께 생성
}

export interface RecurringInput {
  scope: ExpenseScope;
  type: LedgerType;
  category: string;
  name: string;
  amount: number;
  method: string;
  brand: string;
  memo: string;
  dayOfMonth: number;
  startMonth: string; // YYYY-MM
  endMonth: string;   // YYYY-MM 또는 ""
  active: boolean;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PATH = "/expense-plans";
const PUBLIC_MARKER = "/storage/v1/object/public/generated-media/";
const urlList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).filter((u): u is string => typeof u === "string" && u.startsWith("http")).slice(0, 20);
// photos 컬럼 미적용(0095 전)이면 해당 컬럼 없이 재시도.
const isMissingPhotos = (err: { code?: string; message?: string } | null) =>
  !!err && (err.code === "42703" || /photos/.test(err.message ?? ""));

const scopeOf = (s: unknown): ExpenseScope => (s === "개인" ? "개인" : "회사");

async function guard() {
  try {
    const u = await requireAppUser();
    if (u.role !== "owner" && u.role !== "staff") return null;
    if (!isCeoUser(u)) return null;
    return u;
  } catch {
    return null;
  }
}

// 개인 장부는 본인 것만. (회사는 재무 권한자 공유)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ownScope<T>(q: T, scope: ExpenseScope, uid: string): T {
  return scope === "개인" ? ((q as any).eq("created_by", uid) as T) : q;
}

const money = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

function planRow(inp: ExpensePlanInput) {
  const dd = Number(inp.dueDay);
  return {
    scope: scopeOf(inp.scope),
    month: (inp.month ?? "").trim(),
    kind: inp.kind === "변동" ? "변동" : "고정",
    category: (inp.category ?? "").trim() || null,
    name: (inp.name ?? "").trim(),
    planned: money(inp.planned),
    actual: money(inp.actual),
    due_day: Number.isFinite(dd) && dd >= 1 && dd <= 31 ? Math.round(dd) : null,
    brand: (inp.brand ?? "").trim() || null,
    memo: (inp.memo ?? "").trim() || null,
  };
}

function validatePlan(inp: ExpensePlanInput): string | null {
  if (!MONTH_RE.test((inp.month ?? "").trim())) return "월(YYYY-MM)이 올바르지 않습니다.";
  if (!(inp.name ?? "").trim()) return "항목명을 입력하세요.";
  return null;
}

/* ───────── 지출계획 ───────── */

export async function createExpensePlan(inp: ExpensePlanInput): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  const v = validatePlan(inp);
  if (v) return { ok: false, error: v };
  const supabase = createSupabaseServerClient();
  const r = planRow(inp);
  const { data: last } = await ownScope(
    supabase.from("expense_plans").select("sort_order").eq("scope", r.scope).eq("month", r.month).eq("kind", r.kind),
    r.scope,
    u.id
  )
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (Number(last?.sort_order) || 0) + 1;
  const { error } = await supabase.from("expense_plans").insert({ ...r, sort_order, created_by: u.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateExpensePlan(id: string, inp: ExpensePlanInput): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  const v = validatePlan(inp);
  if (v) return { ok: false, error: v };
  const supabase = createSupabaseServerClient();
  const r = planRow(inp);
  const { error } = await ownScope(
    supabase.from("expense_plans").update({ ...r, updated_at: new Date().toISOString() }).eq("id", id),
    r.scope,
    u.id
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

/** 실제 지출 금액만 빠르게 수정 (표에서 인라인 입력) */
export async function setExpenseActual(id: string, actual: number): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("expense_plans")
    .update({ actual: money(actual), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteExpensePlan(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("expense_plans").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

/** 항목 순서 저장 (같은 달·같은 종류 내) */
export async function reorderExpensePlans(ids: string[]): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from("expense_plans").update({ sort_order: i + 1 }).eq("id", ids[i]);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * 이전 달 항목을 이번 달로 복사. (기본: 고정비만, 실제 지출은 0으로 초기화)
 * 같은 이름·종류가 이미 있으면 건너뛴다.
 */
export async function copyExpensePlans(scope: ExpenseScope, fromMonth: string, toMonth: string, kinds: ExpenseKind[] = ["고정"]): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth)) return { ok: false, error: "월 형식이 올바르지 않습니다." };
  if (fromMonth === toMonth) return { ok: false, error: "같은 달로는 복사할 수 없습니다." };
  const sc = scopeOf(scope);
  const supabase = createSupabaseServerClient();
  const ks = kinds.length ? kinds : ["고정"];
  const { data: src, error: e1 } = await ownScope(
    supabase.from("expense_plans").select("kind,category,name,planned,due_day,brand,memo,sort_order").eq("scope", sc).eq("month", fromMonth),
    sc,
    u.id
  )
    .in("kind", ks)
    .order("sort_order", { ascending: true });
  if (e1) return { ok: false, error: e1.message };
  const { data: dst, error: e2 } = await ownScope(
    supabase.from("expense_plans").select("kind,name").eq("scope", sc).eq("month", toMonth),
    sc,
    u.id
  ).in("kind", ks);
  if (e2) return { ok: false, error: e2.message };
  const exists = new Set((dst ?? []).map((d) => `${d.kind}|${(d.name ?? "").trim()}`));
  const rows = (src ?? [])
    .filter((s) => !exists.has(`${s.kind}|${(s.name ?? "").trim()}`))
    .map((s, i) => ({
      scope: sc,
      month: toMonth,
      kind: s.kind,
      category: s.category,
      name: s.name,
      planned: Number(s.planned) || 0,
      actual: 0,
      due_day: s.due_day,
      brand: s.brand,
      memo: s.memo,
      sort_order: 1000 + i,
      created_by: u.id,
    }));
  if (rows.length === 0) return { ok: true, count: 0 };
  const { error } = await supabase.from("expense_plans").insert(rows);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true, count: rows.length };
}

/* ───────── 가계부 (일별 장부) ───────── */

function ledgerRow(inp: LedgerInput) {
  return {
    scope: scopeOf(inp.scope),
    entry_date: (inp.date ?? "").trim(),
    type: inp.type === "수입" ? "수입" : "지출",
    category: (inp.category ?? "").trim() || null,
    name: (inp.name ?? "").trim(),
    amount: money(inp.amount),
    method: (inp.method ?? "").trim() || null,
    brand: (inp.brand ?? "").trim() || null,
    memo: (inp.memo ?? "").trim() || null,
    plan_id: inp.type === "수입" ? null : (inp.planId ?? "").trim() || null,
    photos: urlList(inp.photos),
  };
}

function validateLedger(inp: LedgerInput): string | null {
  if (!DATE_RE.test((inp.date ?? "").trim())) return "날짜(YYYY-MM-DD)가 올바르지 않습니다.";
  if (!(inp.name ?? "").trim()) return "내용을 입력하세요.";
  if (money(inp.amount) <= 0) return "금액을 입력하세요.";
  return null;
}

export async function createLedgerEntry(inp: LedgerInput): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  const v = validateLedger(inp);
  if (v) return { ok: false, error: v };
  const supabase = createSupabaseServerClient();
  const r = ledgerRow(inp);
  let extra: Record<string, unknown> = {};
  let recurringWarn: string | undefined;
  if (inp.repeatMonthly) {
    // 매월 반복 규칙 생성 → 이 기록을 해당 월 분으로 연결
    const month = r.entry_date.slice(0, 7);
    const day = Number(r.entry_date.slice(8, 10)) || 1;
    const { data: rule, error: re } = await supabase
      .from("ledger_recurrings")
      .insert({
        scope: r.scope, type: r.type, category: r.category, name: r.name, amount: r.amount,
        method: r.method, brand: r.brand, memo: r.memo, day_of_month: day, start_month: month, end_month: null, active: true, created_by: u.id,
      })
      .select("id")
      .single();
    if (re) {
      if (isMissingRecurring(re)) recurringWarn = "반복 규칙 테이블(0096)이 아직 적용되지 않아 이번 기록만 저장했습니다.";
      else return { ok: false, error: re.message };
    } else if (rule?.id) {
      extra = { recurring_id: rule.id, recurring_month: month };
    }
  }
  let { error } = await supabase.from("ledger_entries").insert({ ...r, ...extra, created_by: u.id });
  if (isMissingPhotos(error)) {
    const { photos: _p, ...rest } = r;
    ({ error } = await supabase.from("ledger_entries").insert({ ...rest, ...extra, created_by: u.id }));
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return recurringWarn ? { ok: true, error: recurringWarn } : { ok: true };
}

export async function updateLedgerEntry(id: string, inp: LedgerInput): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  const v = validateLedger(inp);
  if (v) return { ok: false, error: v };
  const supabase = createSupabaseServerClient();
  const r = ledgerRow(inp);
  let { error } = await ownScope(
    supabase.from("ledger_entries").update({ ...r, updated_at: new Date().toISOString() }).eq("id", id),
    r.scope,
    u.id
  );
  if (isMissingPhotos(error)) {
    const { photos: _p, ...rest } = r;
    ({ error } = await ownScope(
      supabase.from("ledger_entries").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id),
      r.scope,
      u.id
    ));
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteLedgerEntry(id: string, photoUrls?: string[]): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase0 = createSupabaseServerClient();
  // 반복 규칙으로 생성된 기록이면 그 달을 '건너뜀'으로 표시해 다시 자동 생성되지 않게 한다.
  try {
    const { data: row } = await supabase0.from("ledger_entries").select("recurring_id,recurring_month").eq("id", id).maybeSingle();
    if (row?.recurring_id && row?.recurring_month) {
      const { data: rule } = await supabase0.from("ledger_recurrings").select("skipped_months").eq("id", row.recurring_id).maybeSingle();
      const cur = Array.isArray(rule?.skipped_months) ? (rule!.skipped_months as string[]) : [];
      if (!cur.includes(row.recurring_month)) {
        await supabase0.from("ledger_recurrings").update({ skipped_months: [...cur, row.recurring_month] }).eq("id", row.recurring_id);
      }
    }
  } catch { /* 0096 전 */ }
  // 스토리지의 영수증 사진도 정리(실패는 무시).
  const paths = (photoUrls ?? [])
    .filter((u) => typeof u === "string" && u.includes(PUBLIC_MARKER))
    .map((u) => decodeURIComponent(u.split(PUBLIC_MARKER)[1] || ""))
    .filter(Boolean);
  if (paths.length) {
    try { await createSupabaseServiceClient().storage.from("generated-media").remove(paths); } catch { /* noop */ }
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ledger_entries").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * 가계부에서 계획 항목에 연결된 지출 합계를 각 항목의 '실제' 금액에 반영.
 * (연결된 장부 기록이 있는 항목만 갱신)
 */
export async function applyLedgerToPlans(scope: ExpenseScope, month: string): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!MONTH_RE.test(month)) return { ok: false, error: "월 형식이 올바르지 않습니다." };
  const sc = scopeOf(scope);
  const supabase = createSupabaseServerClient();
  const { data: plans, error: e1 } = await ownScope(
    supabase.from("expense_plans").select("id").eq("scope", sc).eq("month", month),
    sc,
    u.id
  );
  if (e1) return { ok: false, error: e1.message };
  const ids = (plans ?? []).map((p) => p.id as string);
  if (ids.length === 0) return { ok: true, count: 0 };
  const { data: entries, error: e2 } = await supabase
    .from("ledger_entries")
    .select("plan_id,amount")
    .in("plan_id", ids)
    .eq("type", "지출");
  if (e2) return { ok: false, error: e2.message };
  const sums = new Map<string, number>();
  for (const e of entries ?? []) {
    if (!e.plan_id) continue;
    sums.set(e.plan_id, (sums.get(e.plan_id) ?? 0) + (Number(e.amount) || 0));
  }
  let n = 0;
  for (const [id, actual] of sums) {
    const { error } = await supabase.from("expense_plans").update({ actual, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    n++;
  }
  revalidatePath(PATH);
  return { ok: true, count: n };
}

/* ───────── 반복 지출 규칙 ───────── */

function recurringRow(inp: RecurringInput) {
  const day = Math.min(31, Math.max(1, Math.round(Number(inp.dayOfMonth) || 1)));
  return {
    scope: scopeOf(inp.scope),
    type: inp.type === "수입" ? "수입" : "지출",
    category: (inp.category ?? "").trim() || null,
    name: (inp.name ?? "").trim(),
    amount: money(inp.amount),
    method: (inp.method ?? "").trim() || null,
    brand: (inp.brand ?? "").trim() || null,
    memo: (inp.memo ?? "").trim() || null,
    day_of_month: day,
    start_month: (inp.startMonth ?? "").trim(),
    end_month: MONTH_RE.test((inp.endMonth ?? "").trim()) ? inp.endMonth.trim() : null,
    active: inp.active !== false,
  };
}

function validateRecurring(inp: RecurringInput): string | null {
  if (!(inp.name ?? "").trim()) return "내용을 입력하세요.";
  if (money(inp.amount) <= 0) return "금액을 입력하세요.";
  if (!MONTH_RE.test((inp.startMonth ?? "").trim())) return "시작월(YYYY-MM)이 올바르지 않습니다.";
  if ((inp.endMonth ?? "").trim() && !MONTH_RE.test(inp.endMonth.trim())) return "종료월(YYYY-MM)이 올바르지 않습니다.";
  if ((inp.endMonth ?? "").trim() && inp.endMonth.trim() < inp.startMonth.trim()) return "종료월이 시작월보다 빠릅니다.";
  return null;
}

/** 규칙 생성 후, 현재 보고 있는 달(과거·이번 달)에 바로 기록을 만든다. */
export async function createRecurring(inp: RecurringInput, applyMonth?: string): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  const v = validateRecurring(inp);
  if (v) return { ok: false, error: v };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ledger_recurrings").insert({ ...recurringRow(inp), created_by: u.id });
  if (error) return { ok: false, error: isMissingRecurring(error) ? "반복 지출 테이블(0096)이 아직 적용되지 않았습니다. 설정 → DB 스키마 점검에서 SQL을 실행하세요." : error.message };
  let count = 0;
  if (applyMonth && MONTH_RE.test(applyMonth)) count = (await materializeRecurring(supabase, applyMonth, u.id)) ?? 0;
  revalidatePath(PATH);
  return { ok: true, count };
}

export async function updateRecurring(id: string, inp: RecurringInput, applyMonth?: string): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  const v = validateRecurring(inp);
  if (v) return { ok: false, error: v };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ledger_recurrings").update({ ...recurringRow(inp), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  let count = 0;
  if (applyMonth && MONTH_RE.test(applyMonth)) count = (await materializeRecurring(supabase, applyMonth, u.id)) ?? 0;
  revalidatePath(PATH);
  return { ok: true, count };
}

export async function toggleRecurring(id: string, active: boolean): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ledger_recurrings").update({ active: !!active, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

/** 규칙 삭제. 이미 생성된 기록은 남긴다(연결만 해제). */
export async function deleteRecurring(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ledger_recurrings").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

/** 특정 달의 반복 기록을 지금 생성(자동 입력이 안 됐을 때 수동 실행). */
export async function applyRecurringNow(month: string): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!MONTH_RE.test(month)) return { ok: false, error: "월 형식이 올바르지 않습니다." };
  const supabase = createSupabaseServerClient();
  const n = await materializeRecurring(supabase, month, u.id);
  if (n === null) return { ok: false, error: "반복 지출 테이블(0096)이 아직 적용되지 않았습니다." };
  revalidatePath(PATH);
  return { ok: true, count: n };
}

