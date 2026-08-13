"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function guard() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") throw new Error("권한이 없습니다.");
  return user;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /promotions/.test(err.message ?? "");
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function row(fd: FormData) {
  return {
    period_type: String(fd.get("period_type") ?? "월"),
    period_label: String(fd.get("period_label") ?? "").trim() || null,
    title: String(fd.get("title") ?? "").trim(),
    channel: String(fd.get("channel") ?? "").trim() || null,
    plan: String(fd.get("plan") ?? "").trim() || null,
    budget: numOrNull(fd.get("budget")),
    result: String(fd.get("result") ?? "").trim() || null,
    outcome: String(fd.get("outcome") ?? "").trim() || null,
    status: String(fd.get("status") ?? "예정"),
    start_date: String(fd.get("start_date") ?? "") || null,
    end_date: String(fd.get("end_date") ?? "") || null,
  };
}

export async function createPromotion(fd: FormData): Promise<Result> {
  let user;
  try {
    user = await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const base = row(fd);
  if (!base.title) return { ok: false, error: "기획명을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("promotions").insert({ ...base, created_by: user.id });
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  await logAudit({ actorId: user.id, actorName: user.name, action: "created", entity: "promotion", label: base.title });
  revalidatePath("/promotions");
  return { ok: true };
}

export async function updatePromotion(id: string, fd: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("promotions").update({ ...row(fd), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/promotions");
  return { ok: true };
}

export async function deletePromotion(id: string): Promise<Result> {
  let actor;
  try {
    actor = await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ actorId: actor.id, actorName: actor.name, action: "deleted", entity: "promotion", label: id });
  revalidatePath("/promotions");
  return { ok: true };
}
