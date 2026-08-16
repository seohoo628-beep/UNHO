"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
type Result = { ok: boolean; error?: string };
async function guard() { const u = await requireAppUser(); if (u.role !== "owner" && u.role !== "staff") throw new Error("권한이 없습니다."); return u; }
function row(fd: FormData) {
  const num = (k: string) => { const v = String(fd.get(k) ?? "").replace(/[, ]/g, ""); return v === "" ? null : Number(v); };
  return {
    brand_id: String(fd.get("brand_id") ?? "") || null,
    status: String(fd.get("status") ?? "예정"),
    title: String(fd.get("title") ?? "").trim(),
    rationale: String(fd.get("rationale") ?? "").trim() || null,
    benefit_type: String(fd.get("benefit_type") ?? "").trim() || null,
    channel: String(fd.get("channel") ?? "").trim() || null,
    start_date: String(fd.get("start_date") ?? "") || null,
    end_date: String(fd.get("end_date") ?? "") || null,
    target_qty: num("target_qty"),
    target_revenue: num("target_revenue"),
    actual_revenue: num("actual_revenue"),
    buyers: num("buyers"),
    ad_cost: num("ad_cost"),
    note: String(fd.get("note") ?? "").trim() || null,
  };
}
export async function createEvent(fd: FormData): Promise<Result> {
  let u; try { u = await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const base = row(fd); if (!base.title) return { ok: false, error: "이벤트명을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("marketing_events").insert({ ...base, created_by: u.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/events"); return { ok: true };
}
export async function updateEvent(id: string, fd: FormData): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("marketing_events").update({ ...row(fd), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/events"); return { ok: true };
}
export async function deleteEvent(id: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("marketing_events").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/events"); return { ok: true };
}
