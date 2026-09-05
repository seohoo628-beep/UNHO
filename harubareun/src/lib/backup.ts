"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ============================================================================
// 전체 백업/되돌리기.
// 테이블 목록은 DB의 backup_catalog() RPC(0101)로 동적 열거한다(새 테이블 자동 포함).
// RPC가 아직 없으면 아래 정적 목록으로 폴백.
// 안전 원칙:
//  - 스냅샷은 페이지네이션으로 전량 수집. 한도 초과·오류 테이블은 "실패"로 기록하고
//    데이터에 넣지 않는다(부분 스냅샷으로 복원-삭제가 일어나지 않게).
//  - 복원의 삭제 단계는 "스냅샷이 성공한 테이블"만 대상으로 한다.
//  - upsert 충돌키·삭제 비교키는 테이블 PK 메타데이터를 쓴다(복합 PK 지원).
//  - users 참조 FK는 현재 존재하지 않는 사용자를 null/제거로 정리해 FK 위반 방지.
// ============================================================================

type TableMeta = { table: string; pk: string[]; user_fks: string[] };

// RPC 폴백용 정적 카탈로그(부모 → 자식 순서 우선순위 겸용).
const FALLBACK_TABLES: TableMeta[] = [
  { table: "todos", pk: ["id"], user_fks: ["assignee_user_id", "created_by"] },
  { table: "todo_comments", pk: ["id"], user_fks: ["author_user_id"] },
  { table: "todo_notices", pk: ["id"], user_fks: ["created_by"] },
  { table: "launch_checklist", pk: ["id"], user_fks: [] },
  { table: "marketing_events", pk: ["id"], user_fks: [] },
  { table: "revenue_goals", pk: ["id"], user_fks: [] },
  { table: "channel_kpis", pk: ["id"], user_fks: [] },
  { table: "product_developments", pk: ["id"], user_fks: [] },
  { table: "product_shots", pk: ["id"], user_fks: [] },
  { table: "revenue_plans", pk: ["id"], user_fks: [] },
  { table: "content_gallery", pk: ["id"], user_fks: ["uploaded_by"] },
  { table: "leave_members", pk: ["id"], user_fks: [] },
  { table: "leave_usages", pk: ["id"], user_fks: [] },
  { table: "leave_requests", pk: ["id"], user_fks: [] },
  { table: "staff_directory", pk: ["id"], user_fks: [] },
  { table: "vendors", pk: ["id"], user_fks: [] },
  { table: "vendor_price_history", pk: ["id"], user_fks: [] },
  { table: "purchase_orders", pk: ["id"], user_fks: [] },
  { table: "inventory_items", pk: ["id"], user_fks: [] },
  { table: "inventory_movements", pk: ["id"], user_fks: [] },
  { table: "crm_leads", pk: ["id"], user_fks: [] },
  { table: "meetings", pk: ["id"], user_fks: ["created_by"] },
  { table: "product_assets", pk: ["id"], user_fks: [] },
  { table: "manager_logs", pk: ["id"], user_fks: [] },
  { table: "manager_incentives", pk: ["id"], user_fks: [] },
  { table: "designer_logs", pk: ["id"], user_fks: ["author_user_id", "created_by"] },
  { table: "marketer_logs", pk: ["id"], user_fks: ["author_user_id", "created_by"] },
  { table: "bm_logs", pk: ["id"], user_fks: ["author_user_id", "created_by"] },
  { table: "md_logs", pk: ["id"], user_fks: ["author_user_id", "created_by"] },
  { table: "pd_logs", pk: ["id"], user_fks: ["author_user_id", "created_by"] },
  { table: "checklist_items", pk: ["id"], user_fks: [] },
  { table: "checklist_marks", pk: ["check_date", "item_id", "user_id"], user_fks: ["user_id"] },
  { table: "user_preferences", pk: ["user_id"], user_fks: ["user_id"] },
  { table: "app_accounts", pk: ["id"], user_fks: [] },
  { table: "approval_requests", pk: ["id"], user_fks: [] },
  { table: "asset_folders", pk: ["id"], user_fks: [] },
  { table: "promotions", pk: ["id"], user_fks: [] },
  { table: "partner_companies", pk: ["id"], user_fks: [] },
  { table: "partner_posts", pk: ["id"], user_fks: [] },
  { table: "partner_post_comments", pk: ["id"], user_fks: [] },
  { table: "contacts", pk: ["id"], user_fks: [] },
  { table: "reminders", pk: ["id"], user_fks: [] },
];

// 부모 → 자식 upsert 순서(카탈로그에 없는 테이블은 뒤에 알파벳순).
const ORDER_HINT = FALLBACK_TABLES.map((t) => t.table);

const RETENTION_DAYS = 365;
const PAGE = 1000;
const MAX_ROWS = 50000; // 초과 테이블은 백업 실패로 기록(부분 백업 금지)

export type BackupMeta = {
  id: string; label: string; kind: string; createdAt: string;
  total: number; summary: Record<string, number>; failedTables: string[];
};

async function guardOwner() {
  const u = await requireAppUser();
  if (u.role !== "owner") throw new Error("대표만 사용할 수 있습니다.");
  return u;
}

type Svc = ReturnType<typeof createSupabaseServiceClient>;

async function loadCatalog(svc: Svc): Promise<TableMeta[]> {
  try {
    const { data, error } = await svc.rpc("backup_catalog");
    if (!error && Array.isArray(data) && data.length > 0) {
      const metas = (data as any[])
        .map((r) => ({
          table: String(r.table ?? ""),
          pk: Array.isArray(r.pk) ? r.pk.map(String) : [],
          user_fks: Array.isArray(r.user_fks) ? r.user_fks.map(String) : [],
        }))
        .filter((m) => m.table && m.pk.length > 0); // PK 없는 테이블은 안전하게 제외
      if (metas.length > 0) {
        // 부모→자식 힌트 순서로 정렬, 나머지는 알파벳순 뒤에
        return metas.sort((a, b) => {
          const ia = ORDER_HINT.indexOf(a.table); const ib = ORDER_HINT.indexOf(b.table);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return a.table.localeCompare(b.table);
        });
      }
    }
  } catch { /* RPC 미설치 → 폴백 */ }
  return FALLBACK_TABLES;
}

// 페이지네이션 전량 수집. 실패/한도 초과 시 null.
async function fetchAll(svc: Svc, meta: TableMeta): Promise<any[] | null> {
  const rows: any[] = [];
  for (let from = 0; from <= MAX_ROWS; from += PAGE) {
    const { data, error } = await svc
      .from(meta.table)
      .select("*")
      .order(meta.pk[0], { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
    if (rows.length > MAX_ROWS) return null; // 한도 초과 — 부분 백업 금지
  }
  return null;
}

// 실제 스냅샷 저장(서비스 클라이언트로 RLS 우회).
async function takeSnapshot(label: string, kind: string, createdBy: string | null): Promise<{ ok: boolean; error?: string; id?: string; failed?: string[] }> {
  const svc = createSupabaseServiceClient();
  const catalog = await loadCatalog(svc);
  const data: Record<string, any> = {};
  const summary: Record<string, number> = {};
  const failed: string[] = [];

  for (const meta of catalog) {
    const rows = await fetchAll(svc, meta);
    if (rows === null) { failed.push(meta.table); continue; }
    data[meta.table] = rows;
    summary[meta.table] = rows.length;
  }
  if (failed.length) {
    summary["__failed"] = failed.length;
    data["__failed"] = failed;
  }

  const { data: ins, error } = await svc.from("platform_backups").insert({ label, kind, created_by: createdBy, summary, data }).select("id").single();
  if (error) return { ok: false, error: error.message };
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
    await svc.from("platform_backups").delete().lt("created_at", cutoff);
  } catch { /* 정리 실패 무시 */ }
  return { ok: true, id: ins?.id, failed };
}

// 하루 1회 자동 백업(홈 진입 시 호출).
export async function autoDailyBackup(): Promise<void> {
  try {
    const svc = createSupabaseServiceClient();
    const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { data } = await svc.from("platform_backups").select("id").eq("kind", "auto").gte("created_at", since).limit(1);
    if (data && data.length) return;
    await takeSnapshot("자동 일일 백업", "auto", null);
  } catch { /* 자동 백업 실패는 무시 */ }
}

export async function createBackup(label?: string): Promise<{ ok: boolean; error?: string; warning?: string }> {
  let u; try { u = await guardOwner(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const r = await takeSnapshot((label || "").trim() || "수동 백업", "manual", u.id);
  if (!r.ok) return r;
  revalidatePath("/hub");
  const warning = r.failed && r.failed.length ? `일부 테이블은 백업하지 못했습니다: ${r.failed.join(", ")}` : undefined;
  return { ok: true, warning };
}

export async function listBackups(): Promise<{ ok: boolean; error?: string; items?: BackupMeta[] }> {
  try { await guardOwner(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("platform_backups")
    .select("id, label, kind, created_at, summary")
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) return { ok: false, error: error.message };
  const items = (data ?? []).map((r: any) => {
    const summary = (r.summary ?? {}) as Record<string, number>;
    const total = Object.entries(summary)
      .filter(([k]) => !k.startsWith("__"))
      .reduce((s, [, n]) => s + (Number(n) || 0), 0);
    const failedCount = Number(summary["__failed"]) || 0;
    return {
      id: r.id, label: r.label ?? "", kind: r.kind ?? "manual", createdAt: r.created_at,
      total, summary, failedTables: failedCount ? [`${failedCount}개 테이블 백업 실패`] : [],
    };
  }) as BackupMeta[];
  return { ok: true, items };
}

// 지정 백업 시점으로 전체 되돌리기.
export async function restoreBackup(id: string): Promise<{ ok: boolean; error?: string; restored?: number; warning?: string }> {
  let u; try { u = await guardOwner(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const svc = createSupabaseServiceClient();
  const { data: bk, error } = await svc.from("platform_backups").select("data").eq("id", id).single();
  if (error || !bk?.data) return { ok: false, error: "백업을 찾을 수 없습니다." };
  const data = bk.data as Record<string, any>;

  // 복원 전 현재 상태를 pre-restore 백업으로 남긴다(되돌리기의 되돌리기 가능).
  await takeSnapshot("복원 전 자동 백업", "pre-restore", u.id);

  const catalog = await loadCatalog(svc);
  const metaOf = new Map(catalog.map((m) => [m.table, m]));

  // 현재 존재하는 사용자(FK 정리용)
  const { data: curUsers } = await svc.from("users").select("id");
  const validUsers = new Set((curUsers ?? []).map((r: any) => r.id as string));
  const ARRAY_FKS = ["assignee_user_ids"];
  const sanitize = (rows: any[], fks: string[]) =>
    rows.map((r) => {
      const o = { ...r };
      for (const c of fks) if (o[c] && typeof o[c] === "string" && !validUsers.has(o[c])) o[c] = null;
      for (const c of ARRAY_FKS) if (Array.isArray(o[c])) o[c] = o[c].filter((x: string) => validUsers.has(x));
      return o;
    });

  // 스냅샷이 "성공한" 테이블만 복원 대상(실패·미수집 테이블은 건드리지 않는다).
  const present = catalog.filter((m) => Array.isArray(data[m.table]));
  let restored = 0;
  const skipped: string[] = [];

  // 1) upsert(부모 → 자식): 삭제·수정된 행 복구.
  for (const m of present) {
    const rows = data[m.table] as any[];
    if (!rows.length) continue;
    try {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = sanitize(rows.slice(i, i + 500), m.user_fks);
        const { error: e } = await svc.from(m.table).upsert(chunk, { onConflict: m.pk.join(",") });
        if (e) return { ok: false, error: `${m.table} 복원 실패: ${e.message}` };
      }
      restored += rows.length;
    } catch (e: any) { return { ok: false, error: `${m.table} 복원 실패: ${e?.message || e}` }; }
  }

  // 2) 백업 이후 새로 생긴 행 삭제(자식 → 부모 역순).
  const keyOf = (r: any, pk: string[]) => pk.map((c) => String(r?.[c] ?? "")).join("␟");
  for (const m of [...present].reverse()) {
    const keep = new Set((data[m.table] as any[]).map((r) => keyOf(r, m.pk)));
    try {
      const { data: cur, error: e0 } = await svc.from(m.table).select(m.pk.join(","));
      if (e0) { skipped.push(m.table); continue; }
      const extras = ((cur ?? []) as any[]).filter((r) => !keep.has(keyOf(r, m.pk)));
      if (m.pk.length === 1) {
        const ids = extras.map((r) => r[m.pk[0]]).filter((x) => x != null);
        for (let i = 0; i < ids.length; i += 500) {
          const { error: e } = await svc.from(m.table).delete().in(m.pk[0], ids.slice(i, i + 500));
          if (e) return { ok: false, error: `${m.table} 정리 실패: ${e.message}` };
        }
      } else {
        // 복합 PK: 건별 match 삭제(과도 방지 상한)
        for (const r of extras.slice(0, 2000)) {
          const match: Record<string, any> = {};
          for (const c of m.pk) match[c] = r[c];
          const { error: e } = await svc.from(m.table).delete().match(match);
          if (e) return { ok: false, error: `${m.table} 정리 실패: ${e.message}` };
        }
      }
    } catch { skipped.push(m.table); }
  }

  revalidatePath("/hub");
  const failedInBackup = Array.isArray(data["__failed"]) ? (data["__failed"] as string[]) : [];
  const warnBits: string[] = [];
  if (failedInBackup.length) warnBits.push(`이 백업에 빠진 테이블(복원 안 됨): ${failedInBackup.join(", ")}`);
  if (skipped.length) warnBits.push(`정리 건너뜀: ${skipped.join(", ")}`);
  return { ok: true, restored, warning: warnBits.length ? warnBits.join(" · ") : undefined };
}
