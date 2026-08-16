"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// 백업/복원 대상 테이블 — 부모 → 자식 순서.
// (복원 시 upsert는 이 순서, 삭제는 역순으로 처리해 FK 무결성 유지.)
// brands·users·auth 등 기준 데이터는 제외한다.
const BACKUP_TABLES = [
  "todos",
  "todo_comments",
  "launch_checklist",
  "marketing_events",
  "revenue_goals",
  "channel_kpis",
  "product_developments",
  "product_shots",
  "revenue_plans",
  "content_gallery",
  "todo_notices",
  "leave_members",
  "leave_usages",
  "staff_directory",
  "vendors",
  "purchase_orders",
  "inventory_items",
  "crm_leads",
  "meetings",
  "product_assets",
  "manager_logs",
  "designer_logs",
  "marketer_logs",
  "bm_logs",
  "md_logs",
];

const RETENTION_DAYS = 365;
export type BackupMeta = { id: string; label: string; kind: string; createdAt: string; total: number; summary: Record<string, number> };

async function guardOwner() {
  const u = await requireAppUser();
  if (u.role !== "owner") throw new Error("대표만 사용할 수 있습니다.");
  return u;
}

// 실제 스냅샷 저장(서비스 클라이언트로 RLS 우회). createdBy 선택.
async function takeSnapshot(label: string, kind: string, createdBy: string | null): Promise<{ ok: boolean; error?: string; id?: string }> {
  const svc = createSupabaseServiceClient();
  const data: Record<string, any[]> = {};
  const summary: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    try {
      const { data: rows, error } = await svc.from(t).select("*").limit(20000);
      if (!error && Array.isArray(rows)) { data[t] = rows; summary[t] = rows.length; }
    } catch { /* 없는 테이블은 건너뜀 */ }
  }
  const { data: ins, error } = await svc.from("platform_backups").insert({ label, kind, created_by: createdBy, summary, data }).select("id").single();
  if (error) return { ok: false, error: error.message };
  // 1년 초과 백업 정리
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
    await svc.from("platform_backups").delete().lt("created_at", cutoff);
  } catch { /* 정리 실패 무시 */ }
  return { ok: true, id: ins?.id };
}

// 하루 1회 자동 백업(홈 진입 시 호출). 최근 auto 백업이 20시간 이내면 건너뜀.
export async function autoDailyBackup(): Promise<void> {
  try {
    const svc = createSupabaseServiceClient();
    const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { data } = await svc.from("platform_backups").select("id").eq("kind", "auto").gte("created_at", since).limit(1);
    if (data && data.length) return;
    await takeSnapshot("자동 일일 백업", "auto", null);
  } catch { /* 자동 백업 실패는 무시 */ }
}

export async function createBackup(label?: string): Promise<{ ok: boolean; error?: string }> {
  let u; try { u = await guardOwner(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const r = await takeSnapshot((label || "").trim() || "수동 백업", "manual", u.id);
  if (!r.ok) return r;
  revalidatePath("/hub");
  return { ok: true };
}

export async function listBackups(): Promise<{ ok: boolean; error?: string; items?: BackupMeta[] }> {
  try { await guardOwner(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("platform_backups")
    .select("id, label, kind, created_at, summary")
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return { ok: false, error: error.message };
  const items = (data ?? []).map((r: any) => {
    const summary = (r.summary ?? {}) as Record<string, number>;
    const total = Object.values(summary).reduce((s: number, n: any) => s + (Number(n) || 0), 0);
    return { id: r.id, label: r.label ?? "", kind: r.kind ?? "manual", createdAt: r.created_at, total, summary };
  }) as BackupMeta[];
  return { ok: true, items };
}

// 지정 백업 시점으로 전체 되돌리기.
export async function restoreBackup(id: string): Promise<{ ok: boolean; error?: string; restored?: number }> {
  let u; try { u = await guardOwner(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const svc = createSupabaseServiceClient();
  const { data: bk, error } = await svc.from("platform_backups").select("data").eq("id", id).single();
  if (error || !bk?.data) return { ok: false, error: "백업을 찾을 수 없습니다." };
  const data = bk.data as Record<string, any[]>;

  // 복원 전 현재 상태를 pre-restore 백업으로 남긴다(되돌리기의 되돌리기 가능).
  await takeSnapshot("복원 전 자동 백업", "pre-restore", u.id);

  const present = BACKUP_TABLES.filter((t) => Array.isArray(data[t]));
  let restored = 0;

  // 1) upsert(부모 → 자식): 삭제·수정된 행 복구.
  for (const t of present) {
    const rows = data[t];
    if (!rows.length) continue;
    try {
      // 큰 테이블은 나눠서 upsert
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error: e } = await svc.from(t).upsert(chunk, { onConflict: "id" });
        if (e) return { ok: false, error: `${t} 복원 실패: ${e.message}` };
      }
      restored += rows.length;
    } catch (e: any) { return { ok: false, error: `${t} 복원 실패: ${e?.message || e}` }; }
  }

  // 2) 백업 이후 새로 생긴 행 삭제(자식 → 부모 역순).
  for (const t of [...present].reverse()) {
    const keepIds = new Set((data[t] || []).map((r: any) => r.id).filter(Boolean));
    try {
      const { data: cur } = await svc.from(t).select("id");
      const extras = ((cur ?? []) as { id: string }[]).map((r) => r.id).filter((x) => x && !keepIds.has(x));
      for (let i = 0; i < extras.length; i += 500) {
        const chunk = extras.slice(i, i + 500);
        const { error: e } = await svc.from(t).delete().in("id", chunk);
        if (e) return { ok: false, error: `${t} 정리 실패: ${e.message}` };
      }
    } catch { /* id 컬럼 없는 테이블 등은 건너뜀 */ }
  }

  revalidatePath("/hub");
  return { ok: true, restored };
}
