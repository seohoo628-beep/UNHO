"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import type { CeoTodo } from "./data";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function ownerGuard() {
  const u = await requireAppUser();
  return u.role === "owner" ? u : null;
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
    text: t.text,
    pri: t.pri,
    done: !!t.done,
    link: t.link ?? null,
    files: (t.files && t.files.length ? t.files : t.fileUrl ? [{ url: t.fileUrl, name: t.fileName ?? "파일" }] : []),
    src: t.src ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertCeoTodo(t: CeoTodo): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ceo_todos").upsert(toRow(t));
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
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

// 여러 개 한 번에 서버로 올리기(이 기기 localStorage 이전 · 전직원 투두 이관에 사용)
export async function importCeoTodos(list: CeoTodo[]): Promise<Result> {
  if (!(await ownerGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const rows = (list || []).filter((t) => t && t.id && t.text).map(toRow);
  if (rows.length === 0) return { ok: true };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ceo_todos").upsert(rows);
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/ceo-todos");
  return { ok: true };
}
