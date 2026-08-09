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
  return err.code === "42P01" || /revenue_plans/.test(err.message ?? "");
}

function row(fd: FormData) {
  return {
    period_type: String(fd.get("period_type") ?? "주"),
    period_label: String(fd.get("period_label") ?? "").trim() || null,
    lever: String(fd.get("lever") ?? "유입·체류"),
    title: String(fd.get("title") ?? "").trim(),
    plan: String(fd.get("plan") ?? "").trim() || null,
    record: String(fd.get("record") ?? "").trim() || null,
    target: String(fd.get("target") ?? "").trim() || null,
    actual: String(fd.get("actual") ?? "").trim() || null,
    status: String(fd.get("status") ?? "예정"),
    log_date: String(fd.get("log_date") ?? "") || null,
  };
}

export async function createRevenuePlan(fd: FormData): Promise<Result> {
  let user;
  try {
    user = await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const base = row(fd);
  if (!base.title) return { ok: false, error: "플랜명을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("revenue_plans").insert({ ...base, created_by: user.id });
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  await logAudit({ actorId: user.id, actorName: user.name, action: "created", entity: "revenue_plan", label: base.title });
  revalidatePath("/revenue-plans");
  return { ok: true };
}

export async function updateRevenuePlan(id: string, fd: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("revenue_plans").update({ ...row(fd), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/revenue-plans");
  return { ok: true };
}

export async function deleteRevenuePlan(id: string): Promise<Result> {
  let actor;
  try {
    actor = await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("revenue_plans").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ actorId: actor.id, actorName: actor.name, action: "deleted", entity: "revenue_plan", label: id });
  revalidatePath("/revenue-plans");
  return { ok: true };
}
