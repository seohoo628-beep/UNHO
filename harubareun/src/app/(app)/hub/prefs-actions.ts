"use server";

import { requireAppUser } from "@/lib/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizePrefs, type UserPrefs } from "@/lib/prefs";

type Result = { ok: boolean; error?: string; prefs?: UserPrefs };

// 내 환경설정 읽기(서비스 클라이언트, 본인 것만).
export async function getMyPrefs(): Promise<UserPrefs> {
  try {
    const u = await requireAppUser();
    const svc = createSupabaseServiceClient();
    const { data } = await svc.from("user_preferences").select("prefs").eq("user_id", u.id).maybeSingle();
    return normalizePrefs(data?.prefs);
  } catch {
    return {};
  }
}

// 부분 패치 병합 저장.
export async function saveMyPrefs(patch: Partial<UserPrefs>): Promise<Result> {
  let u;
  try { u = await requireAppUser(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("user_preferences").select("prefs").eq("user_id", u.id).maybeSingle();
  const current = normalizePrefs(data?.prefs);
  const merged = normalizePrefs({ ...current, ...patch });
  const { error } = await svc
    .from("user_preferences")
    .upsert({ user_id: u.id, prefs: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, prefs: merged };
}
