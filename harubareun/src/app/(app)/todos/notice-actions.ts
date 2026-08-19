"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function guard() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") throw new Error("권한이 없습니다.");
  return user;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /todo_notices/.test(err.message ?? "");
}

export async function createNotice(fd: FormData): Promise<Result> {
  let user;
  try {
    user = await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "공지 내용을 입력하세요." };
  const pinned = String(fd.get("pinned") ?? "") === "on";
  const scope = String(fd.get("scope") ?? "todos") === "worklog" ? "worklog" : "todos";
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("todo_notices").insert({ body, pinned, scope, created_by: user.id });
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/todos");
  revalidatePath("/work-logs");
  return { ok: true };
}

export async function togglePinNotice(id: string, pinned: boolean): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("todo_notices").update({ pinned }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  revalidatePath("/work-logs");
  return { ok: true };
}

export async function deleteNotice(id: string): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("todo_notices").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  revalidatePath("/work-logs");
  return { ok: true };
}
