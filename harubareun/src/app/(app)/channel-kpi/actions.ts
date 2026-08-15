"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };
async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") throw new Error("권한이 없습니다.");
  return u;
}
export async function createKpi(fd: FormData): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const metric = String(fd.get("metric") ?? "").trim();
  if (!metric) return { ok: false, error: "지표명을 입력하세요." };
  const num = (k: string) => { const v = String(fd.get(k) ?? "").replace(/[, ]/g, ""); return v === "" ? null : Number(v); };
  const { error } = await supabase.from("channel_kpis").insert({
    brand_id: String(fd.get("brand_id") ?? "") || null,
    category: String(fd.get("category") ?? "리뷰"),
    metric,
    target: num("target"),
    current: num("current") ?? 0,
    target_date: String(fd.get("target_date") ?? "") || null,
    performer: String(fd.get("performer") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/channel-kpi");
  return { ok: true };
}
export async function updateKpiCurrent(id: string, current: number): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("channel_kpis").update({ current, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/channel-kpi");
  return { ok: true };
}
export async function deleteKpi(id: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("channel_kpis").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/channel-kpi");
  return { ok: true };
}
