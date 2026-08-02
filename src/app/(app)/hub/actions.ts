"use server";

import { requireAppUser } from "@/lib/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Result = { ok: boolean; error?: string };

export async function toggleDailyCheck(date: string, itemKey: string, done: boolean): Promise<Result> {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return { ok: false, error: "권한이 없습니다." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !itemKey) return { ok: false, error: "잘못된 요청입니다." };
  const svc = createSupabaseServiceClient();
  if (done) {
    const { error } = await svc
      .from("daily_checks")
      .upsert(
        { check_date: date, item_key: itemKey, done: true, updated_by: u.id, updated_at: new Date().toISOString() },
        { onConflict: "check_date,item_key" }
      );
    if (error) return { ok: false, error: error.message };
  } else {
    // 해제 = 행 삭제 (다음 로드 시 미체크로 표시)
    const { error } = await svc.from("daily_checks").delete().eq("check_date", date).eq("item_key", itemKey);
    if (error) return { ok: false, error: error.message };
  }
  // revalidatePath는 일부러 호출하지 않는다: 체크 즉시 화면 재조회가 방금 누른 상태를 덮어
  // 되돌리는 경합을 없앤다. 저장은 DB에 되고, 다음 페이지 로드 때 최신값을 읽는다.
  return { ok: true };
}
