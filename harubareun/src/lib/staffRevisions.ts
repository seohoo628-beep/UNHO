"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";

export type StaffRevision = { id: string; note: string; createdAt: string; snapshot: any };

async function staffGuard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") throw new Error("권한이 없습니다.");
  return u;
}

// 편집/삭제 직전의 전체 행을 버전 기록으로 저장(호출 측에서 이전 행을 넘긴다).
export async function snapshotStaffRecord(entity: string, recordId: string, snapshot: any, note = "저장 전"): Promise<void> {
  try {
    if (!entity || !recordId || !snapshot) return;
    const svc = createSupabaseServiceClient();
    await svc.from("record_revisions").insert({ entity, record_id: recordId, snapshot, note });
  } catch {
    /* 버전 기록 실패는 본 작업을 막지 않는다 */
  }
}

export async function getStaffRevisions(entity: string, recordId: string): Promise<{ ok: boolean; error?: string; items?: StaffRevision[] }> {
  try { await staffGuard(); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("record_revisions")
    .select("*")
    .eq("entity", entity)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []).map((r: any) => ({ id: r.id, note: r.note ?? "", createdAt: r.created_at, snapshot: r.snapshot })) };
}

export async function applyStaffRevision(entity: string, recordId: string, revisionId: string): Promise<{ ok: boolean; error?: string }> {
  try { await staffGuard(); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const svc = createSupabaseServiceClient();
  const { data: rev } = await supabase.from("record_revisions").select("snapshot").eq("id", revisionId).single();
  if (!rev?.snapshot) return { ok: false, error: "복원할 버전을 찾을 수 없습니다." };
  const { data: cur } = await svc.from(entity).select("*").eq("id", recordId).single();
  if (cur) await svc.from("record_revisions").insert({ entity, record_id: recordId, snapshot: cur, note: "복원 전" });
  const snap: Record<string, any> = { ...rev.snapshot };
  delete snap.id; delete snap.created_at;
  snap.updated_at = new Date().toISOString();
  const { error } = await svc.from(entity).update(snap).eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
