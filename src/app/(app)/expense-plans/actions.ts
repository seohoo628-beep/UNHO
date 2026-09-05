"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";

type Result = { ok: boolean; error?: string; count?: number };

export type ExpenseKind = "고정" | "변동";

export interface ExpensePlanInput {
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

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function guard() {
  try {
    const u = await requireAppUser();
    if (u.role !== "owner" && u.role !== "staff") return null;
    if (!canViewFinance(u)) return null;
    return u;
  } catch {
    return null;
  }
}

function row(inp: ExpensePlanInput) {
  const dd = Number(inp.dueDay);
  return {
    month: (inp.month ?? "").trim(),
    kind: inp.kind === "변동" ? "변동" : "고정",
    category: (inp.category ?? "").trim() || null,
    name: (inp.name ?? "").trim(),
    planned: Math.max(0, Math.round(Number(inp.planned) || 0)),
    actual: Math.max(0, Math.round(Number(inp.actual) || 0)),
    due_day: Number.isFinite(dd) && dd >= 1 && dd <= 31 ? Math.round(dd) : null,
    brand: (inp.brand ?? "").trim() || null,
    memo: (inp.memo ?? "").trim() || null,
  };
}

function validate(inp: ExpensePlanInput): string | null {
  if (!MONTH_RE.test((inp.month ?? "").trim())) return "월(YYYY-MM)이 올바르지 않습니다.";
  if (!(inp.name ?? "").trim()) return "항목명을 입력하세요.";
  return null;
}

export async function createExpensePlan(inp: ExpensePlanInput): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  const v = validate(inp);
  if (v) return { ok: false, error: v };
  const supabase = createSupabaseServerClient();
  const r = row(inp);
  // 같은 달·같은 종류 맨 아래에 추가
  const { data: last } = await supabase
    .from("expense_plans")
    .select("sort_order")
    .eq("month", r.month)
    .eq("kind", r.kind)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (Number(last?.sort_order) || 0) + 1;
  const { error } = await supabase.from("expense_plans").insert({ ...r, sort_order, created_by: u.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expense-plans");
  return { ok: true };
}

export async function updateExpensePlan(id: string, inp: ExpensePlanInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const v = validate(inp);
  if (v) return { ok: false, error: v };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("expense_plans")
    .update({ ...row(inp), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expense-plans");
  return { ok: true };
}

/** 실제 지출 금액만 빠르게 수정 (표에서 인라인 입력) */
export async function setExpenseActual(id: string, actual: number): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("expense_plans")
    .update({ actual: Math.max(0, Math.round(Number(actual) || 0)), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expense-plans");
  return { ok: true };
}

export async function deleteExpensePlan(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("expense_plans").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expense-plans");
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
  revalidatePath("/expense-plans");
  return { ok: true };
}

/**
 * 이전 달 항목을 이번 달로 복사. (기본: 고정비만, 실제 지출은 0으로 초기화)
 * 같은 이름·종류가 이미 있으면 건너뛴다.
 */
export async function copyExpensePlans(fromMonth: string, toMonth: string, kinds: ExpenseKind[] = ["고정"]): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth)) return { ok: false, error: "월 형식이 올바르지 않습니다." };
  if (fromMonth === toMonth) return { ok: false, error: "같은 달로는 복사할 수 없습니다." };
  const supabase = createSupabaseServerClient();
  const ks = kinds.length ? kinds : ["고정"];
  const { data: src, error: e1 } = await supabase
    .from("expense_plans")
    .select("kind,category,name,planned,due_day,brand,memo,sort_order")
    .eq("month", fromMonth)
    .in("kind", ks)
    .order("sort_order", { ascending: true });
  if (e1) return { ok: false, error: e1.message };
  const { data: dst, error: e2 } = await supabase
    .from("expense_plans")
    .select("kind,name")
    .eq("month", toMonth)
    .in("kind", ks);
  if (e2) return { ok: false, error: e2.message };
  const exists = new Set((dst ?? []).map((d) => `${d.kind}|${(d.name ?? "").trim()}`));
  const rows = (src ?? [])
    .filter((s) => !exists.has(`${s.kind}|${(s.name ?? "").trim()}`))
    .map((s, i) => ({
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
  revalidatePath("/expense-plans");
  return { ok: true, count: rows.length };
}
