"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { snapshotCeoRecord } from "@/lib/ceoRevisions";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function guard() {
  const u = await requireAppUser();
  if (!isCeoUser(u)) throw new Error("권한이 없습니다.");
  return u;
}
function missing(err: { code?: string; message?: string } | null) {
  return !!err && (err.code === "42P01" || /antiaging_logs/.test(err.message ?? ""));
}
function toInt(s: string): number | null {
  const n = parseInt(String(s ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
function row(fd: FormData) {
  return {
    log_date: String(fd.get("log_date") ?? "").trim() || null,
    hospital: String(fd.get("hospital") ?? "").trim() || null,
    treatment: String(fd.get("treatment") ?? "").trim() || null,
    doctor: String(fd.get("doctor") ?? "").trim() || null,
    area: String(fd.get("area") ?? "").trim() || null,
    cost: toInt(String(fd.get("cost") ?? "")),
    next_date: String(fd.get("next_date") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
  };
}

export async function createLog(fd: FormData): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const base = row(fd);
  if (!base.hospital && !base.treatment && !base.log_date) return { ok: false, error: "날짜·병원·시술 중 하나는 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("antiaging_logs").insert(base);
  if (error) return { ok: false, error: error.message, tableMissing: missing(error) };
  revalidatePath("/antiaging");
  return { ok: true };
}

export async function updateLog(id: string, fd: FormData): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { data: prev } = await supabase.from("antiaging_logs").select("*").eq("id", id).single();
  if (prev) await snapshotCeoRecord("antiaging_logs", id, prev, "저장 전");
  const { error } = await supabase.from("antiaging_logs").update({ ...row(fd), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/antiaging");
  return { ok: true };
}

export async function deleteLog(id: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("antiaging_logs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/antiaging");
  return { ok: true };
}
