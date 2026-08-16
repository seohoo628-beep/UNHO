"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { snapshotCeoRecord } from "@/lib/ceoRevisions";

type Result = { ok: boolean; error?: string; tableMissing?: boolean; columnMissing?: boolean };

async function guard() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) throw new Error("권한이 없습니다.");
  return user;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /reminders/.test(err.message ?? "");
}

export async function createReminder(text: string, cat: string, brand: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const t = (text || "").trim();
  if (!t) return { ok: false, error: "내용을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("reminders").insert({ text: t, cat: (cat || "").trim() || null, brand: (brand || "").trim() || null });
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/reminders");
  return { ok: true };
}

export async function updateReminder(id: string, text: string, cat: string, brand: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const t = (text || "").trim();
  if (!t) return { ok: false, error: "내용을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { data: prev } = await supabase.from("reminders").select("*").eq("id", id).single();
  if (prev) await snapshotCeoRecord("reminders", id, prev, "저장 전");
  const { error } = await supabase.from("reminders").update({ text: t, cat: (cat || "").trim() || null, brand: (brand || "").trim() || null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reminders");
  return { ok: true };
}

export async function toggleReminder(id: string, done: boolean): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("reminders").update({ done, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reminders");
  return { ok: true };
}

// 하위 체크리스트 저장(jsonb).
export async function setReminderChecklist(id: string, checklist: { id: string; text: string; done: boolean; pinned?: boolean }[]): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const clean = (Array.isArray(checklist) ? checklist : [])
    .map((c) => ({ id: String(c?.id ?? ""), text: String(c?.text ?? "").trim(), done: !!c?.done, pinned: !!c?.pinned }))
    .filter((c) => c.id && c.text);
  const { error } = await supabase.from("reminders").update({ checklist: clean, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    const columnMissing = error.code === "42703" || /checklist/.test(error.message ?? "");
    return { ok: false, error: columnMissing ? "체크리스트 컬럼이 없습니다. 0080 마이그레이션을 실행해 주세요." : error.message, columnMissing };
  }
  revalidatePath("/reminders");
  return { ok: true };
}

// 상단 고정 토글.
export async function setReminderPinned(id: string, pinned: boolean): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("reminders").update({ pinned }).eq("id", id);
  if (error) {
    const columnMissing = error.code === "42703" || /pinned/.test(error.message ?? "");
    return { ok: false, error: error.message, columnMissing };
  }
  revalidatePath("/reminders");
  return { ok: true };
}

// 수동 정렬 순서 저장(위/아래·최상단·드래그 이동).
export async function reorderReminders(order: { id: string; sortOrder: number }[]): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const results = await Promise.all(
    (order || []).map((o) => supabase.from("reminders").update({ sort_order: o.sortOrder }).eq("id", o.id))
  );
  const err = results.find((r) => r.error)?.error;
  if (err) {
    const columnMissing = err.code === "42703" || /sort_order/.test(err.message ?? "");
    return { ok: false, error: err.message, columnMissing };
  }
  revalidatePath("/reminders");
  return { ok: true };
}

export async function deleteReminder(id: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reminders");
  return { ok: true };
}
