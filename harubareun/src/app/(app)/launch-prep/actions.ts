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

const STATUSES = ["미착수", "진행", "완료", "지연", "보류"];

export async function updateChecklistStatus(id: string, status: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  if (!STATUSES.includes(status)) return { ok: false, error: "잘못된 상태" };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("launch_checklist")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/launch-prep");
  return { ok: true };
}
