"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateTodayBrief } from "@/lib/morningBrief";

async function guard() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) throw new Error("권한이 없습니다.");
  return user;
}

export async function generateBriefNow(): Promise<{ ok: boolean; html?: string; date?: string; error?: string; tableMissing?: boolean }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const r = await generateTodayBrief();
  if (!r.ok) return { ok: false, error: r.error, tableMissing: r.tableMissing };
  revalidatePath("/morning-brief");
  return { ok: true, html: r.html, date: r.date };
}

export async function fetchBrief(date: string): Promise<{ ok: boolean; html?: string; error?: string }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("morning_briefs").select("html").eq("brief_date", date).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, html: (data as { html?: string } | null)?.html ?? "" };
}
