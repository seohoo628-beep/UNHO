"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

export interface AccountInput {
  service: string;
  purpose: string;
  loginId: string;
  password: string;
  url: string;
  note: string;
}

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

function row(inp: AccountInput) {
  return {
    service: inp.service.trim(),
    purpose: inp.purpose?.trim() || null,
    login_id: inp.loginId?.trim() || null,
    password: inp.password ?? null,
    url: inp.url?.trim() || null,
    note: inp.note?.trim() || null,
  };
}

export async function createAccount(inp: AccountInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  if (!inp.service?.trim()) return { ok: false, error: "서비스명을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("app_accounts").insert(row(inp));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounts");
  return { ok: true };
}

export async function updateAccount(id: string, inp: AccountInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("app_accounts")
    .update({ ...row(inp), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounts");
  return { ok: true };
}

export async function deleteAccount(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("app_accounts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounts");
  return { ok: true };
}
