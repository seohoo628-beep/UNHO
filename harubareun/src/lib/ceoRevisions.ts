"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";

export type CeoRevision = { id: string; note: string; createdAt: string; snapshot: any };

async function ceoGuard() {
  const u = await requireAppUser();
  if (!isCeoUser(u)) throw new Error("권한이 없습니다.");
}

// 편집/삭제 직전의 전체 행을 버전 기록으로 저장(호출 측에서 이전 행을 넘긴다).
export async function snapshotCeoRecord(entity: string, recordId: string, snapshot: any, note = "저장 전"): Promise<void> {
  try {
    await ceoGuard();
    if (!entity || !recordId || !snapshot) return;
    const supabase = createSupabaseServerClient();
    await supabase.from("ceo_record_revisions").insert({ entity, record_id: recordId, snapshot, note });
  } catch {
    /* 버전 기록 실패는 본 작업을 막지 않는다 */
  }
}

export async function getCeoRevisions(entity: string, recordId: string): Promise<{ ok: boolean; error?: string; items?: CeoRevision[] }> {
  try { await ceoGuard(); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ceo_record_revisions")
    .select("*")
    .eq("entity", entity)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []).map((r: any) => ({ id: r.id, note: r.note ?? "", createdAt: r.created_at, snapshot: r.snapshot })) };
}

// 특정 버전으로 복원. 복원 전 현재 상태도 스냅샷(되돌리기 가능).
export async function applyCeoRevision(entity: string, recordId: string, revisionId: string): Promise<{ ok: boolean; error?: string }> {
  try { await ceoGuard(); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { data: rev } = await supabase.from("ceo_record_revisions").select("snapshot").eq("id", revisionId).single();
  if (!rev?.snapshot) return { ok: false, error: "복원할 버전을 찾을 수 없습니다." };
  const { data: cur } = await supabase.from(entity).select("*").eq("id", recordId).single();
  if (cur) await supabase.from("ceo_record_revisions").insert({ entity, record_id: recordId, snapshot: cur, note: "복원 전" });
  const snap: Record<string, any> = { ...rev.snapshot };
  delete snap.id; delete snap.created_at;
  snap.updated_at = new Date().toISOString();
  const { error } = await supabase.from(entity).update(snap).eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
