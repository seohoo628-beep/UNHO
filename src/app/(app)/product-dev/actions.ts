"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { seoulToday } from "@/lib/time";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function guardUser() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") throw new Error("권한이 없습니다.");
  return user;
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /product_developments/.test(err.message ?? "");
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// AttachmentPicker가 넘기는 files_json 파싱.
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

// files 컬럼이 아직 없을 때(마이그레이션 전) 나는 에러인지 판별.
function isFilesColMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || /\bfiles\b/.test(err.message ?? "");
}

export async function createProductDev(formData: FormData): Promise<Result> {
  let user;
  try {
    user = await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "제품(개발건)명을 입력하세요." };

  const base = {
    name,
    brand_id: String(formData.get("brand_id") ?? "") || null,
    category: String(formData.get("category") ?? "").trim() || null,
    stage: String(formData.get("stage") ?? "아이디어"),
    target_date: String(formData.get("target_date") ?? "") || null,
    cost_estimate: numOrNull(formData.get("cost_estimate")),
    vendor_id: String(formData.get("vendor_id") ?? "") || null,
    link: String(formData.get("link") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    owner_user_id: String(formData.get("owner_user_id") ?? "") || null,
    created_by: user.id,
  };
  const withFiles = { ...base, files: parseFiles(formData.get("files_json")) };

  let { error } = await supabase.from("product_developments").insert(withFiles);
  if (error && isFilesColMissing(error) && !isMissingTable(error)) {
    ({ error } = await supabase.from("product_developments").insert(base));
  }
  if (error) return { ok: false, error: error.message, tableMissing: isMissingTable(error) };
  revalidatePath("/product-dev");
  return { ok: true };
}

export async function updateProductDev(id: string, formData: FormData): Promise<Result> {
  try {
    await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const base = {
    name: String(formData.get("name") ?? "").trim(),
    brand_id: String(formData.get("brand_id") ?? "") || null,
    category: String(formData.get("category") ?? "").trim() || null,
    target_date: String(formData.get("target_date") ?? "") || null,
    cost_estimate: numOrNull(formData.get("cost_estimate")),
    vendor_id: String(formData.get("vendor_id") ?? "") || null,
    link: String(formData.get("link") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    owner_user_id: String(formData.get("owner_user_id") ?? "") || null,
    updated_at: new Date().toISOString(),
  };
  const withFiles = { ...base, files: parseFiles(formData.get("files_json")) };

  let { error } = await supabase.from("product_developments").update(withFiles).eq("id", id);
  if (error && isFilesColMissing(error)) {
    ({ error } = await supabase.from("product_developments").update(base).eq("id", id));
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/product-dev");
  return { ok: true };
}

export async function updateProductDevStage(id: string, stage: string): Promise<Result> {
  try {
    await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const patch: Record<string, unknown> = { stage, updated_at: new Date().toISOString() };
  if (stage === "출시") patch.launched_at = seoulToday();
  const { error } = await supabase.from("product_developments").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/product-dev");
  return { ok: true };
}

export async function deleteProductDev(id: string): Promise<Result> {
  try {
    await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("product_developments").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/product-dev");
  return { ok: true };
}
