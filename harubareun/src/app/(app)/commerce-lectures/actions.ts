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
  return err.code === "42P01" || /commerce_lectures/.test(err.message ?? "");
}

function parseFiles(v: FormDataEntryValue | null): { url: string; name: string }[] {
  try {
    const arr = JSON.parse(String(v ?? "[]"));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((f) => f && typeof f.url === "string")
      .map((f) => ({ url: f.url, name: typeof f.name === "string" ? f.name : "file" }));
  } catch {
    return [];
  }
}

export async function createLecture(fd: FormData): Promise<Result> {
  let user;
  try {
    user = await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const title = String(fd.get("title") ?? "").trim();
  const files = parseFiles(fd.get("files_json"));
  const link = String(fd.get("link") ?? "").trim();
  if (!title && files.length === 0 && !link) return { ok: false, error: "제목·파일·링크 중 하나는 입력하세요." };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("commerce_lectures").insert({
    title: title || "제목 없음",
    category: String(fd.get("category") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
    link: link || null,
    files,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/commerce-lectures");
  return { ok: true };
}

export async function updateLecture(id: string, fd: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("commerce_lectures").update({
    title: String(fd.get("title") ?? "").trim() || "제목 없음",
    category: String(fd.get("category") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
    link: String(fd.get("link") ?? "").trim() || null,
    files: parseFiles(fd.get("files_json")),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/commerce-lectures");
  return { ok: true };
}

export async function deleteLecture(id: string): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("commerce_lectures").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/commerce-lectures");
  return { ok: true };
}
