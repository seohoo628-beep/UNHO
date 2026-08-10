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
  return err.code === "42P01" || /reminders/.test(err.message ?? "");
}

export async function createReminder(text: string, cat: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const t = (text || "").trim();
  if (!t) return { ok: false, error: "내용을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("reminders").insert({ text: t, cat: (cat || "").trim() || null });
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/reminders");
  return { ok: true };
}

export async function updateReminder(id: string, text: string, cat: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const t = (text || "").trim();
  if (!t) return { ok: false, error: "내용을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("reminders").update({ text: t, cat: (cat || "").trim() || null, updated_at: new Date().toISOString() }).eq("id", id);
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

export async function deleteReminder(id: string): Promise<Result> {
  try { await guard(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "권한 오류" }; }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reminders");
  return { ok: true };
}
