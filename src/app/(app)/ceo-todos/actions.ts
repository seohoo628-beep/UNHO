"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { sendCeoTodoDigest } from "@/lib/ceoTodoDigest";
import { sendCeoDueReminders } from "@/lib/ceoTodoReminders";
import { isCeoUser } from "@/lib/ceo";
import { snapshotCeoRecord } from "@/lib/ceoRevisions";
import type { CeoTodo } from "./data";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function ownerGuard() {
  const u = await requireAppUser();
  return isCeoUser(u) ? u : null;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /ceo_todos/.test(err.message ?? "");
}

function toRow(t: CeoTodo) {
  return {
    id: t.id,
    no: t.no ?? null,
    cat: t.cat ?? null,
    brand: t.brand ?? null,
    text: t.text,
    pri: t.pri,
    done: !!t.done,
    link: t.link ?? null,
    files: (t.files && t.files.length ? t.files : t.fileUrl ? [{ url: t.fileUrl, name: t.fileName ?? "파일" }] : []),
    due_date: t.dueDate ?? null,
    checklist: Array.isArray(t.checklist) ? t.checklist : [],
    src: t.src ?? null,
    updated_at: new Date().toISOString(),
  };
}

// 선택 컬럼(due_date/brand/checklist) 미적용 시 나는 오류인지 판별.
function isOptColMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || /due_date|brand|checklist/.test(err.message ?? "");
}

export async function upsertCeoTodo(t: CeoTodo): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  // 기존 항목 수정이면 편집 직전 상태를 버전 기록으로 남긴다.
  const { data: prevRow } = await supabase.from("ceo_todos").select("*").eq("id", t.id).single();
  if (prevRow) await snapshotCeoRecord("ceo_todos", t.id, prevRow, "저장 전");
  let { error } = await supabase.from("ceo_todos").upsert(toRow(t));
  if (error && isOptColMissing(error)) {
    const { due_date, brand, checklist, ...rest } = toRow(t);
    void due_date; void brand; void checklist;
    ({ error } = await supabase.from("ceo_todos").upsert(rest));
  }
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/ceo-todos");
  return { ok: true };
}

// 하위 체크리스트만 저장(카드에서 즉시 체크). 컬럼 없으면 안내.
export async function setCeoChecklist(id: string, checklist: { id: string; text: string; done: boolean }[]): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const clean = (Array.isArray(checklist) ? checklist : [])
    .map((c) => ({ id: String(c?.id ?? ""), text: String(c?.text ?? "").trim(), done: !!c?.done }))
    .filter((c) => c.text).slice(0, 100);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ceo_todos").update({ checklist: clean, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    if (error.code === "42703" || /checklist/.test(error.message ?? "")) return { ok: false, error: "체크리스트 컬럼이 없습니다. 0078_todo_checklist.sql을 실행하세요." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/ceo-todos");
  return { ok: true };
}

export async function toggleCeoTodo(id: string, done: boolean): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ceo_todos").update({ done, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/ceo-todos");
  return { ok: true };
}

export async function deleteCeoTodo(id: string): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ceo_todos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/ceo-todos");
  return { ok: true };
}

// 지금 바로 '당장실행' 다이제스트 테스트 발송(대표 전용).
export async function testSendCeoDigest(): Promise<{ ok: boolean; sent?: boolean; count?: number; dueToday?: number; due3?: number; error?: string }> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const r = await sendCeoTodoDigest();
  const rem = await sendCeoDueReminders();
  if (r.skipped) return { ok: false, error: "메일 발송 설정(RESEND_API_KEY)이 필요합니다." };
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, sent: r.sent, count: r.count, dueToday: rem.dueToday, due3: rem.due3 };
}

// 상단 고정 토글. pinned 컬럼 없으면 columnMissing.
export async function setCeoPinned(id: string, pinned: boolean): Promise<{ ok: boolean; error?: string; columnMissing?: boolean }> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ceo_todos").update({ pinned }).eq("id", id);
  if (error) {
    const columnMissing = error.code === "42703" || /pinned/.test(error.message ?? "");
    return { ok: false, error: error.message, columnMissing };
  }
  revalidatePath("/ceo-todos");
  return { ok: true };
}

// 수동 정렬 순서 저장(위/아래 이동). sort_order 컬럼 없으면 columnMissing.
export async function reorderCeoTodos(
  order: { id: string; sortOrder: number }[]
): Promise<{ ok: boolean; error?: string; columnMissing?: boolean }> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const results = await Promise.all(
    (order || []).map((o) => supabase.from("ceo_todos").update({ sort_order: o.sortOrder }).eq("id", o.id))
  );
  const err = results.find((r) => r.error)?.error;
  if (err) {
    const columnMissing = err.code === "42703" || /sort_order/.test(err.message ?? "");
    return { ok: false, error: err.message, columnMissing };
  }
  revalidatePath("/ceo-todos");
  return { ok: true };
}

// 여러 개 한 번에 서버로 올리기(이 기기 localStorage 이전 · 전직원 투두 이관에 사용)
export async function importCeoTodos(list: CeoTodo[]): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const rows = (list || []).filter((t) => t && t.id && t.text).map(toRow);
  if (rows.length === 0) return { ok: true };
  const supabase = createSupabaseServerClient();
  let { error } = await supabase.from("ceo_todos").upsert(rows);
  if (error && isOptColMissing(error)) {
    const stripped = rows.map(({ due_date, brand, checklist, ...rest }) => { void due_date; void brand; void checklist; return rest; });
    ({ error } = await supabase.from("ceo_todos").upsert(stripped));
  }
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/ceo-todos");
  return { ok: true };
}
