"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
type Result = { ok: boolean; error?: string };
async function guard() { const u = await requireAppUser(); if (u.role !== "owner" && u.role !== "staff") throw new Error("권한이 없습니다."); return u; }
export async function updateGoal(id: string, value: number): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("revenue_goals").update({ value, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/goals"); return { ok: true };
}
export async function createGoal(fd: FormData): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const metric = String(fd.get("metric") ?? "").trim();
  if (!metric) return { ok: false, error: "지표명을 입력하세요." };
  const val = String(fd.get("value") ?? "").replace(/[, ]/g, "");
  const { error } = await supabase.from("revenue_goals").insert({
    scope: String(fd.get("scope") ?? "전사"), metric, value: val === "" ? null : Number(val),
    unit: String(fd.get("unit") ?? "").trim() || null, note: String(fd.get("note") ?? "").trim() || null, sort_order: 99,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/goals"); return { ok: true };
}
export async function deleteGoal(id: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("revenue_goals").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/goals"); return { ok: true };
}
