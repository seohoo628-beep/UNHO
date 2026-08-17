"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";
import { CHECKLIST } from "@/lib/dailyChecklist";
import { normalizePrefs, type UserPrefs } from "@/lib/userPrefs";

type Result = { ok: boolean; error?: string };

const LABEL_BY_KEY: Record<string, string> = Object.fromEntries(CHECKLIST.flatMap((g) => g.items.map((i) => [i.key, i.label])));

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
  // #9 완료 로그: 체크 시 감사 로그에 기록(해제는 기록 안 함). 실패는 무시.
  if (done) {
    try { await logAudit({ actorId: u.id, actorName: u.name, action: "status", entity: "daily_check", label: `완료: ${date} · ${LABEL_BY_KEY[itemKey] ?? itemKey}` }); } catch { /* noop */ }
  }
  // revalidatePath는 일부러 호출하지 않는다: 체크 즉시 화면 재조회가 방금 누른 상태를 덮어
  // 되돌리는 경합을 없앤다. 저장은 DB에 되고, 다음 페이지 로드 때 최신값을 읽는다.
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// 사용자 정의 체크리스트 항목 CRUD (홈 '오늘의 체크리스트' 편집)
// ─────────────────────────────────────────────────────────────

async function guardEditor(): Promise<{ id: string; name: string } | null> {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return { id: u.id, name: u.name ?? "" };
}

const cleanWeekdays = (w: unknown): number[] | null => {
  if (!Array.isArray(w)) return null;
  const arr = [...new Set(w.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
  return arr.length === 0 || arr.length === 7 ? null : arr;
};

export type DailyItemInput = { group?: string; label: string; href?: string; note?: string; weekdays?: number[]; assignee?: string };

export async function addDailyItem(input: DailyItemInput): Promise<Result> {
  const u = await guardEditor();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  const label = (input.label ?? "").trim();
  if (!label) return { ok: false, error: "항목 내용을 입력하세요." };
  const svc = createSupabaseServiceClient();
  const { data: mx } = await svc.from("daily_checklist_items").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((mx?.sort_order as number | undefined) ?? 0) + 1;
  const row: Record<string, unknown> = {
    group_name: (input.group ?? "").trim() || "내 항목",
    label,
    href: (input.href ?? "").trim() || null,
    note: (input.note ?? "").trim() || null,
    weekdays: cleanWeekdays(input.weekdays),
    assignee: (input.assignee ?? "").trim() || null,
    sort_order: nextOrder,
    created_by: u.id,
  };
  let ins = await svc.from("daily_checklist_items").insert(row);
  if (ins.error && /assignee/.test(ins.error.message ?? "")) { delete row.assignee; ins = await svc.from("daily_checklist_items").insert(row); }
  if (ins.error) return { ok: false, error: ins.error.message };
  revalidatePath("/hub");
  return { ok: true };
}

export async function updateDailyItem(id: string, input: DailyItemInput): Promise<Result> {
  const u = await guardEditor();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  const label = (input.label ?? "").trim();
  if (!label) return { ok: false, error: "항목 내용을 입력하세요." };
  const svc = createSupabaseServiceClient();
  const patch: Record<string, unknown> = {
    group_name: (input.group ?? "").trim() || "내 항목",
    label,
    href: (input.href ?? "").trim() || null,
    note: (input.note ?? "").trim() || null,
    weekdays: cleanWeekdays(input.weekdays),
    assignee: (input.assignee ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  let upd = await svc.from("daily_checklist_items").update(patch).eq("id", id).eq("created_by", u.id);
  if (upd.error && /assignee/.test(upd.error.message ?? "")) { delete patch.assignee; upd = await svc.from("daily_checklist_items").update(patch).eq("id", id).eq("created_by", u.id); }
  if (upd.error) return { ok: false, error: upd.error.message };
  revalidatePath("/hub");
  return { ok: true };
}

export async function deleteDailyItem(id: string): Promise<Result> {
  const u = await guardEditor();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("daily_checklist_items").delete().eq("id", id).eq("created_by", u.id);
  if (error) return { ok: false, error: error.message };
  // 체크 기록도 함께 정리(있으면).
  try { await svc.from("daily_checks").delete().eq("item_key", `custom:${id}`); } catch { /* noop */ }
  revalidatePath("/hub");
  return { ok: true };
}

export async function reorderDailyItems(ids: string[]): Promise<Result> {
  const u = await guardEditor();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true };
  const svc = createSupabaseServiceClient();
  // 본인 항목만, 배열 순서대로 sort_order 재부여.
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await svc.from("daily_checklist_items").update({ sort_order: i, updated_at: now }).eq("id", ids[i]).eq("created_by", u.id);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/hub");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// 개인별 맞춤 설정(user_prefs) — 부분 패치를 기존 값에 병합 저장
// ─────────────────────────────────────────────────────────────

export async function setUserPrefs(patch: Partial<UserPrefs>): Promise<Result> {
  const u = await guardEditor();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  const svc = createSupabaseServiceClient();
  try {
    const { data: cur } = await svc.from("user_prefs").select("prefs").eq("user_id", u.id).maybeSingle();
    const merged: UserPrefs = { ...normalizePrefs(cur?.prefs), ...patch };
    const { error } = await svc.from("user_prefs").upsert(
      { user_id: u.id, prefs: merged, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (error) return { ok: false, error: error.message };
    // 즐겨찾기/숨김은 클라이언트가 낙관적으로 이미 반영하므로 홈 전체를 재검증하지 않는다.
    // (무거운 홈 페이지를 매 클릭마다 다시 그리면 방금 누른 상태가 되돌려지고 앱이 불안정해짐)
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장 실패" };
  }
}
