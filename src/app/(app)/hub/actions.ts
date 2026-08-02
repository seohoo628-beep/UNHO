"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Result = { ok: boolean; error?: string };

export async function toggleDailyCheck(date: string, itemKey: string, done: boolean): Promise<Result> {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return { ok: false, error: "권한이 없습니다." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !itemKey) return { ok: false, error: "잘못된 요청입니다." };
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("daily_checks")
    .upsert(
      { check_date: date, item_key: itemKey, done, updated_by: u.id, updated_at: new Date().toISOString() },
      { onConflict: "check_date,item_key" }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hub");
  return { ok: true };
}
