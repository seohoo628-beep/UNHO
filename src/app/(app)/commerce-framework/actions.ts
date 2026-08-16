"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

async function requireStaff() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") return null;
  return user;
}

function tableMissing(err: { code?: string; message?: string } | null, name: string): boolean {
  if (!err) return false;
  return err.code === "42P01" || new RegExp(`relation .*${name}.* does not exist`, "i").test(err.message ?? "");
}

// ── 브랜드 매출 목표 ──────────────────────────────────────────
export type RevenueGoal = { brand: string; annual: number; staff: number; fixedMonthly: number; marginPct: number; weekendMult: number };

export async function getRevenueGoals(): Promise<{ ok: boolean; goals: RevenueGoal[]; tableMissing?: boolean }> {
  await requireAppUser();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("brand_revenue_goals").select("*");
  if (error) return { ok: false, goals: [], tableMissing: tableMissing(error, "brand_revenue_goals") };
  const goals: RevenueGoal[] = (data ?? []).map((r: any) => ({
    brand: r.brand,
    annual: Number(r.annual) || 0,
    staff: Number(r.staff) || 1,
    fixedMonthly: Number(r.fixed_monthly) || 0,
    marginPct: Number(r.margin_pct) || 0,
    weekendMult: Number(r.weekend_mult) || 1.3,
  }));
  return { ok: true, goals };
}

export async function saveRevenueGoal(g: RevenueGoal): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  if (!g.brand) return { ok: false, error: "브랜드가 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("brand_revenue_goals").upsert({
    brand: g.brand,
    annual: g.annual || 0,
    staff: g.staff || 1,
    fixed_monthly: g.fixedMonthly || 0,
    margin_pct: g.marginPct || 0,
    weekend_mult: g.weekendMult || 1.3,
    updated_at: new Date().toISOString(),
    updated_by_name: user.name,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/commerce-framework");
  revalidatePath("/hub");
  return { ok: true };
}

// ── 제품 8필터 심사 ──────────────────────────────────────────
export type Screening = {
  id: string;
  productName: string;
  brand: string | null;
  checks: boolean[];
  diffs: string[];
  passed: boolean;
  note: string | null;
  author: string | null;
  createdAt: string;
};

export async function listScreenings(): Promise<{ ok: boolean; items: Screening[]; tableMissing?: boolean }> {
  await requireAppUser();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_screenings")
    .select("id, product_name, brand, checks, diffs, passed, note, created_by_name, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, items: [], tableMissing: tableMissing(error, "product_screenings") };
  const items: Screening[] = (data ?? []).map((r: any) => ({
    id: r.id,
    productName: r.product_name ?? "",
    brand: r.brand ?? null,
    checks: Array.isArray(r.checks) ? r.checks : [],
    diffs: Array.isArray(r.diffs) ? r.diffs : [],
    passed: !!r.passed,
    note: r.note ?? null,
    author: r.created_by_name ?? null,
    createdAt: r.created_at ?? "",
  }));
  return { ok: true, items };
}

export async function saveScreening(input: {
  id?: string;
  productName: string;
  brand?: string | null;
  checks: boolean[];
  diffs: string[];
  passed: boolean;
  note?: string | null;
}): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  if (!input.productName.trim()) return { ok: false, error: "제품명을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const row = {
    product_name: input.productName.trim(),
    brand: input.brand || null,
    checks: input.checks,
    diffs: input.diffs,
    passed: input.passed,
    note: input.note || null,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { error } = await supabase.from("product_screenings").update(row).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("product_screenings").insert({ ...row, created_by: user.id, created_by_name: user.name });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/product-dev");
  return { ok: true };
}

export async function deleteScreening(id: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("product_screenings").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/product-dev");
  return { ok: true };
}
