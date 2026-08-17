"use server";

import { requireAppUser } from "@/lib/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

type Result = { ok: boolean; error?: string; id?: string };

// ── 개인별 완료 토글 ─────────────────────────────────────────────────────────
export async function toggleChecklistMark(date: string, itemId: string, done: boolean): Promise<Result> {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return { ok: false, error: "권한이 없습니다." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !itemId) return { ok: false, error: "잘못된 요청입니다." };
  const svc = createSupabaseServiceClient();
  if (done) {
    const { error } = await svc
      .from("checklist_marks")
      .upsert({ check_date: date, item_id: itemId, user_id: u.id, updated_at: new Date().toISOString() }, { onConflict: "check_date,item_id,user_id" });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await svc.from("checklist_marks").delete().eq("check_date", date).eq("item_id", itemId).eq("user_id", u.id);
    if (error) return { ok: false, error: error.message };
  }
  // revalidate 안 함: 방금 누른 상태를 재조회가 덮는 경합 방지(toggleDailyCheck와 동일 정책).
  return { ok: true };
}

// ── 항목 관리(대표 전용) ──────────────────────────────────────────────────────
async function guardOwner() {
  const u = await requireAppUser();
  if (u.role !== "owner") throw new Error("대표만 항목을 편집할 수 있습니다.");
  return u;
}

const RECUR = new Set(["daily", "weekly", "monthly"]);

export async function createChecklistItem(input: {
  group: string;
  label: string;
  href?: string;
  role?: string;
  recurrence?: string;
  weekday?: number | null;
  monthDay?: number | null;
}): Promise<Result> {
  try { await guardOwner(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const label = (input.label || "").trim();
  if (!label) return { ok: false, error: "항목 이름을 입력하세요." };
  const recurrence = RECUR.has(input.recurrence || "") ? input.recurrence! : "daily";
  const svc = createSupabaseServiceClient();
  const { data: maxRow } = await svc.from("checklist_items").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((maxRow?.sort_order as number) ?? 0) + 10;
  const { data, error } = await svc
    .from("checklist_items")
    .insert({
      group_name: (input.group || "운영").trim(),
      label,
      href: (input.href || "").trim() || null,
      role: (input.role || "").trim() || null,
      recurrence,
      weekday: recurrence === "weekly" ? (input.weekday ?? null) : null,
      month_day: recurrence === "monthly" ? (input.monthDay ?? null) : null,
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hub");
  return { ok: true, id: data?.id };
}

export async function updateChecklistItem(id: string, patch: {
  group?: string;
  label?: string;
  href?: string;
  role?: string;
  recurrence?: string;
  weekday?: number | null;
  monthDay?: number | null;
  active?: boolean;
}): Promise<Result> {
  try { await guardOwner(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.group !== undefined) row.group_name = patch.group.trim() || "운영";
  if (patch.label !== undefined) {
    const l = patch.label.trim();
    if (!l) return { ok: false, error: "항목 이름을 입력하세요." };
    row.label = l;
  }
  if (patch.href !== undefined) row.href = patch.href.trim() || null;
  if (patch.role !== undefined) row.role = patch.role.trim() || null;
  if (patch.recurrence !== undefined) {
    const rec = RECUR.has(patch.recurrence) ? patch.recurrence : "daily";
    row.recurrence = rec;
    row.weekday = rec === "weekly" ? (patch.weekday ?? null) : null;
    row.month_day = rec === "monthly" ? (patch.monthDay ?? null) : null;
  } else {
    if (patch.weekday !== undefined) row.weekday = patch.weekday;
    if (patch.monthDay !== undefined) row.month_day = patch.monthDay;
  }
  if (patch.active !== undefined) row.active = patch.active;
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("checklist_items").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hub");
  return { ok: true };
}

export async function deleteChecklistItem(id: string): Promise<Result> {
  try { await guardOwner(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("checklist_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hub");
  return { ok: true };
}

// 순서 이동: 위/아래 항목과 sort_order 교환.
export async function moveChecklistItem(id: string, dir: "up" | "down"): Promise<Result> {
  try { await guardOwner(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const svc = createSupabaseServiceClient();
  const { data: all, error } = await svc.from("checklist_items").select("id, sort_order").order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const list = (all ?? []) as { id: string; sort_order: number }[];
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return { ok: false, error: "항목을 찾을 수 없습니다." };
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true }; // 끝
  const a = list[idx], b = list[swapIdx];
  await svc.from("checklist_items").update({ sort_order: b.sort_order }).eq("id", a.id);
  await svc.from("checklist_items").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidatePath("/hub");
  return { ok: true };
}
