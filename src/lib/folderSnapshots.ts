"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";

// 폴더(테이블) 전체를 한 시점으로 통째로 백업/복원하는 "노션식 전체 되돌리기".
// record_revisions(행 1개 단위)와 달리, 폴더 전체 행을 한 스냅샷으로 저장한다.

export type FolderSnapMeta = { id: string; note: string; createdAt: string; rowCount: number };

type SnapCfg = { entity: string; scope: "ceo" | "staff"; label: string };
// 화이트리스트: 여기 등록된 테이블만 전체 백업/복원 가능(임의 테이블 접근 차단).
const SNAP_CONFIG: Record<string, SnapCfg> = {
  ceo_todos:      { entity: "ceo_todos",      scope: "ceo",   label: "CEO 투두" },
  reminders:      { entity: "reminders",      scope: "ceo",   label: "리마인드" },
  ideas:          { entity: "ideas",          scope: "ceo",   label: "아이디어" },
  contacts:       { entity: "contacts",       scope: "ceo",   label: "인적자산" },
  tiktok_leads:   { entity: "tiktok_leads",   scope: "ceo",   label: "틱톡 에이전트" },
  business_cards: { entity: "business_cards", scope: "ceo",   label: "명함" },
  meetings:       { entity: "meetings",       scope: "staff", label: "미팅·회의" },
  todos:          { entity: "todos",          scope: "staff", label: "업무투두" },
  receivables:    { entity: "receivables",    scope: "staff", label: "미수금" },
  payables:       { entity: "payables",       scope: "staff", label: "미지급금" },
};

const AUTO_THROTTLE_MS = 12 * 60 * 60 * 1000; // 자동 백업 간격(12시간)
const RETENTION_DAYS = 365;                   // 보관 기간(1년). 이보다 오래된 백업은 자동 삭제.
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const LIST_LIMIT = 800;                       // 목록에 보여줄 최대 시점 수(약 1년치 커버)
const cutoffIso = () => new Date(Date.now() - RETENTION_MS).toISOString();

function cfgFor(entity: string): SnapCfg | null {
  return SNAP_CONFIG[entity] ?? null;
}

// 권한: ceo 폴더는 대표만, staff 폴더는 owner/staff.
async function guard(cfg: SnapCfg) {
  const u = await requireAppUser();
  const ok = cfg.scope === "ceo" ? isCeoUser(u) : (u.role === "owner" || u.role === "staff");
  if (!ok) throw new Error("권한이 없습니다.");
  return u;
}

async function fetchAllRows(entity: string): Promise<any[]> {
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.from(entity).select("*").limit(5000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// 오래된 스냅샷 정리(1년 지난 것만 삭제 — 그 안은 모두 보관해 언제든 복원 가능).
async function prune(entity: string) {
  try {
    const svc = createSupabaseServiceClient();
    await svc.from("folder_snapshots").delete().eq("entity", entity).lt("created_at", cutoffIso());
  } catch { /* 정리는 실패해도 무방 */ }
}

// 행 배열을 정렬·직렬화한 지문(변경 감지용).
function signature(rows: any[]): string {
  try { return JSON.stringify([...rows].sort((a, b) => String(a?.id).localeCompare(String(b?.id)))); }
  catch { return String(rows?.length ?? 0); }
}

// 실제 스냅샷 저장(내부). skipIfUnchanged=true면 직전 백업과 내용이 같을 때 저장을 건너뛴다
// (자동 백업이 똑같은 스냅샷을 1년간 수천 개 쌓지 않도록).
async function writeSnapshot(cfg: SnapCfg, note: string, skipIfUnchanged = false): Promise<{ ok: boolean; error?: string; count?: number; unchanged?: boolean }> {
  try {
    const rows = await fetchAllRows(cfg.entity);
    const svc = createSupabaseServiceClient();
    if (skipIfUnchanged) {
      const { data: last } = await svc.from("folder_snapshots").select("rows,row_count").eq("entity", cfg.entity).order("created_at", { ascending: false }).limit(1);
      const prev = last?.[0];
      if (prev && (prev.row_count ?? -1) === rows.length && signature(Array.isArray(prev.rows) ? prev.rows : []) === signature(rows)) {
        return { ok: true, count: rows.length, unchanged: true };
      }
    }
    const { error } = await svc.from("folder_snapshots").insert({ entity: cfg.entity, scope: cfg.scope, rows, row_count: rows.length, note });
    if (error) return { ok: false, error: error.message };
    void prune(cfg.entity);
    return { ok: true, count: rows.length };
  } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
}

// 폴더 화면 진입 시 호출: 마지막 자동/수동 백업이 오래됐으면(또는 없으면) 한 개 만든다.
// 이렇게 하면 별도 크론 없이도 시간대별 복원 지점이 자연스럽게 쌓인다.
export async function ensureFolderSnapshot(entity: string): Promise<{ ok: boolean }> {
  const cfg = cfgFor(entity);
  if (!cfg) return { ok: false };
  try { await guard(cfg); } catch { return { ok: false }; }
  try {
    const svc = createSupabaseServiceClient();
    const { data } = await svc.from("folder_snapshots").select("created_at").eq("entity", entity).order("created_at", { ascending: false }).limit(1);
    const last = data?.[0]?.created_at ? new Date(data[0].created_at).getTime() : 0;
    if (Date.now() - last < AUTO_THROTTLE_MS) return { ok: true };
    await writeSnapshot(cfg, "자동 백업", true); // 직전과 동일하면 저장 안 함
    return { ok: true };
  } catch { return { ok: false }; }
}

// 수동 "지금 백업".
export async function snapshotFolderNow(entity: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  const cfg = cfgFor(entity);
  if (!cfg) return { ok: false, error: "지원하지 않는 폴더입니다." };
  try { await guard(cfg); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  return writeSnapshot(cfg, "수동 백업");
}

// 시점 목록.
export async function listFolderSnapshots(entity: string): Promise<{ ok: boolean; error?: string; items?: FolderSnapMeta[] }> {
  const cfg = cfgFor(entity);
  if (!cfg) return { ok: false, error: "지원하지 않는 폴더입니다." };
  try { await guard(cfg); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.from("folder_snapshots").select("id,note,created_at,row_count").eq("entity", entity).order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []).map((r: any) => ({ id: r.id, note: r.note ?? "", createdAt: r.created_at, rowCount: r.row_count ?? 0 })) };
}

// 특정 시점으로 폴더 전체 복원. 복원 전 현재 상태도 스냅샷(되돌리기 가능).
// 복원 = 스냅샷 이후 생긴 행 삭제 + 스냅샷의 모든 행 upsert(수정·삭제된 행 복구).
export async function restoreFolderSnapshot(entity: string, snapshotId: string): Promise<{ ok: boolean; error?: string; restored?: number; deleted?: number }> {
  const cfg = cfgFor(entity);
  if (!cfg) return { ok: false, error: "지원하지 않는 폴더입니다." };
  try { await guard(cfg); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  const svc = createSupabaseServiceClient();
  try {
    const { data: snap, error: se } = await svc.from("folder_snapshots").select("rows,entity").eq("id", snapshotId).single();
    if (se || !snap) return { ok: false, error: "복원할 시점을 찾을 수 없습니다." };
    if (snap.entity !== entity) return { ok: false, error: "스냅샷 폴더가 일치하지 않습니다." };
    const snapRows: any[] = Array.isArray(snap.rows) ? snap.rows : [];

    // 복원 전 현재 상태 백업(되돌릴 수 있게).
    await writeSnapshot(cfg, "복원 전");

    // 스냅샷 이후 새로 생긴 행 삭제.
    const snapIds = new Set(snapRows.map((r) => String(r.id)));
    const { data: cur } = await svc.from(entity).select("id");
    const toDelete = (cur ?? []).map((r: any) => String(r.id)).filter((id: string) => !snapIds.has(id));
    let deleted = 0;
    if (toDelete.length) {
      const { error } = await svc.from(entity).delete().in("id", toDelete);
      if (error) return { ok: false, error: "삭제 중 오류: " + error.message };
      deleted = toDelete.length;
    }
    // 스냅샷의 모든 행 되살리기(수정된 행은 원복, 삭제됐던 행은 재생성).
    if (snapRows.length) {
      const { error } = await svc.from(entity).upsert(snapRows, { onConflict: "id" });
      if (error) return { ok: false, error: "복원 중 오류: " + error.message };
    }
    return { ok: true, restored: snapRows.length, deleted };
  } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
}

// ── 전체 폴더(플랫폼 전체) 한 시점 백업/복원 ──────────────────────────────
// 홈화면에서 모든 폴더의 내용을 한 시점으로 통째로 되돌린다. 대표(최운호)만.
const ALL_ENTITY = "__ALL__";
const ALL_THROTTLE_MS = 12 * 60 * 60 * 1000; // 자동 전체 백업 간격(12시간)

async function guardCeoAll() {
  const u = await requireAppUser();
  if (!isCeoUser(u)) throw new Error("전체 되돌리기는 대표만 사용할 수 있습니다.");
  return u;
}

// 모든 등록 폴더의 현재 행을 한 스냅샷(entity=__ALL__)에 담아 저장.
async function writeAllSnapshot(note: string, skipIfUnchanged = false): Promise<{ ok: boolean; error?: string; count?: number; unchanged?: boolean }> {
  try {
    const payload: Record<string, any[]> = {};
    let total = 0;
    for (const entity of Object.keys(SNAP_CONFIG)) {
      try {
        const rows = await fetchAllRows(entity);
        payload[entity] = rows;
        total += rows.length;
      } catch { payload[entity] = payload[entity] ?? []; }
    }
    const svc = createSupabaseServiceClient();
    if (skipIfUnchanged) {
      const { data: last } = await svc.from("folder_snapshots").select("rows,row_count").eq("entity", ALL_ENTITY).order("created_at", { ascending: false }).limit(1);
      const prev = last?.[0];
      if (prev && (prev.row_count ?? -1) === total) {
        const prevSig = Object.keys(SNAP_CONFIG).map((e) => signature(Array.isArray((prev.rows as any)?.[e]) ? (prev.rows as any)[e] : [])).join("|");
        const curSig = Object.keys(SNAP_CONFIG).map((e) => signature(payload[e] ?? [])).join("|");
        if (prevSig === curSig) return { ok: true, count: total, unchanged: true };
      }
    }
    const { error } = await svc.from("folder_snapshots").insert({ entity: ALL_ENTITY, scope: "all", rows: payload, row_count: total, note });
    if (error) return { ok: false, error: error.message };
    // 전체 스냅샷도 1년 지난 것만 삭제.
    void (async () => {
      try {
        await svc.from("folder_snapshots").delete().eq("entity", ALL_ENTITY).lt("created_at", cutoffIso());
      } catch { /* noop */ }
    })();
    return { ok: true, count: total };
  } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
}

// 홈 진입 시: 마지막 전체 백업이 오래됐으면(또는 없으면) 하나 만든다.
export async function ensureAllSnapshot(): Promise<{ ok: boolean }> {
  try { await guardCeoAll(); } catch { return { ok: false }; }
  try {
    const svc = createSupabaseServiceClient();
    const { data } = await svc.from("folder_snapshots").select("created_at").eq("entity", ALL_ENTITY).order("created_at", { ascending: false }).limit(1);
    const last = data?.[0]?.created_at ? new Date(data[0].created_at).getTime() : 0;
    if (Date.now() - last < ALL_THROTTLE_MS) return { ok: true };
    await writeAllSnapshot("자동 전체 백업", true); // 직전과 동일하면 저장 안 함
    return { ok: true };
  } catch { return { ok: false }; }
}

export async function snapshotAllNow(): Promise<{ ok: boolean; error?: string; count?: number }> {
  try { await guardCeoAll(); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  return writeAllSnapshot("수동 전체 백업");
}

export async function listAllSnapshots(): Promise<{ ok: boolean; error?: string; items?: FolderSnapMeta[] }> {
  try { await guardCeoAll(); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.from("folder_snapshots").select("id,note,created_at,row_count").eq("entity", ALL_ENTITY).order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []).map((r: any) => ({ id: r.id, note: r.note ?? "", createdAt: r.created_at, rowCount: r.row_count ?? 0 })) };
}

// 특정 시점으로 전체 폴더 복원. 복원 전 현재 전체 상태도 백업.
export async function restoreAllSnapshot(snapshotId: string): Promise<{ ok: boolean; error?: string; folders?: number; restored?: number; deleted?: number }> {
  try { await guardCeoAll(); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  const svc = createSupabaseServiceClient();
  try {
    const { data: snap, error: se } = await svc.from("folder_snapshots").select("rows,entity").eq("id", snapshotId).single();
    if (se || !snap) return { ok: false, error: "복원할 시점을 찾을 수 없습니다." };
    if (snap.entity !== ALL_ENTITY) return { ok: false, error: "전체 스냅샷이 아닙니다." };
    const payload: Record<string, any[]> = (snap.rows && typeof snap.rows === "object" && !Array.isArray(snap.rows)) ? snap.rows : {};

    // 복원 전 현재 전체 상태 백업.
    await writeAllSnapshot("전체 복원 전");

    let folders = 0, restored = 0, deleted = 0;
    for (const entity of Object.keys(payload)) {
      if (!SNAP_CONFIG[entity]) continue; // 화이트리스트 밖은 건너뜀
      const snapRows: any[] = Array.isArray(payload[entity]) ? payload[entity] : [];
      const snapIds = new Set(snapRows.map((r) => String(r.id)));
      const { data: cur } = await svc.from(entity).select("id");
      const toDelete = (cur ?? []).map((r: any) => String(r.id)).filter((id: string) => !snapIds.has(id));
      if (toDelete.length) {
        const { error } = await svc.from(entity).delete().in("id", toDelete);
        if (!error) deleted += toDelete.length;
      }
      if (snapRows.length) {
        const { error } = await svc.from(entity).upsert(snapRows, { onConflict: "id" });
        if (!error) restored += snapRows.length;
      }
      folders++;
    }
    return { ok: true, folders, restored, deleted };
  } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
}
