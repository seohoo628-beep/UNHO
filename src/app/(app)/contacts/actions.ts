"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function guard() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) throw new Error("권한이 없습니다.");
  return user;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /contacts/.test(err.message ?? "");
}

function row(fd: FormData) {
  return {
    name: String(fd.get("name") ?? "").trim(),
    job: String(fd.get("job") ?? "").trim() || null,
    company: String(fd.get("company") ?? "").trim() || null,
    contact: String(fd.get("contact") ?? "").trim() || null,
    birthday: String(fd.get("birthday") ?? "").trim() || null,
    where_met: String(fd.get("where_met") ?? "").trim() || null,
    marital: String(fd.get("marital") ?? "").trim() || null,
    has_children: String(fd.get("has_children") ?? "") === "on" || String(fd.get("has_children") ?? "") === "true",
    children_names: String(fd.get("children_names") ?? "").trim() || null,
    note: String(fd.get("note") ?? "").trim() || null,
  };
}

export async function createContact(fd: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const base = row(fd);
  if (!base.name) return { ok: false, error: "이름을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("contacts").insert(base);
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/contacts");
  return { ok: true };
}

export async function updateContact(id: string, fd: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("contacts").update({ ...row(fd), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contacts");
  return { ok: true };
}

export async function deleteContact(id: string): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contacts");
  return { ok: true };
}
