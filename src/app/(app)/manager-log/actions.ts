"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { seoulToday } from "@/lib/time";

type Result = { ok: boolean; error?: string };

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

// ── 일일 업무일지 ──────────────────────────────────────────────
export interface LogInput {
  logDate: string;
  category: string;
  task: string;
  status: string;
  note: string;
}

function logRow(inp: LogInput) {
  return {
    log_date: inp.logDate || seoulToday(),
    category: inp.category || "기타",
    task: inp.task.trim(),
    status: inp.status || "예정",
    note: inp.note?.trim() || null,
  };
}

export async function createLog(inp: LogInput): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!inp.task?.trim()) return { ok: false, error: "업무 내용을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("manager_logs").insert({ ...logRow(inp), created_by: u.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/manager-log");
  return { ok: true };
}

export async function updateLog(id: string, inp: LogInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("manager_logs")
    .update({ ...logRow(inp), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/manager-log");
  return { ok: true };
}

export async function deleteLog(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("manager_logs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/manager-log");
  return { ok: true };
}

// ── 월간 성과·인센티브 ──────────────────────────────────────────
export interface IncentiveInput {
  month: string;
  gongguCount: number;
  gongguSales: number;
  promoSales: number;
  ratePct: number;
  note: string;
}

export async function saveIncentive(inp: IncentiveInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  if (!/^\d{4}-\d{2}$/.test(inp.month)) return { ok: false, error: "월 형식은 YYYY-MM 이어야 합니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("manager_incentives").upsert(
    {
      month: inp.month,
      gonggu_count: Number(inp.gongguCount) || 0,
      gonggu_sales: Number(inp.gongguSales) || 0,
      promo_sales: Number(inp.promoSales) || 0,
      rate_pct: Number(inp.ratePct) || 0,
      note: inp.note?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "month" }
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/manager-log");
  return { ok: true };
}

export async function deleteIncentive(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("manager_incentives").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/manager-log");
  return { ok: true };
}
