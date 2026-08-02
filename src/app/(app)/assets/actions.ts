"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

export interface AssetInput {
  title: string;
  kind: string;
  brand: string;
  link: string;
  thumbUrl: string;
  note: string;
}

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

function row(inp: AssetInput) {
  return {
    title: inp.title.trim(),
    kind: inp.kind || "이미지",
    brand: inp.brand?.trim() || null,
    link: inp.link?.trim() || null,
    thumb_url: inp.thumbUrl?.trim() || null,
    note: inp.note?.trim() || null,
  };
}

export async function createAsset(inp: AssetInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  if (!inp.title?.trim()) return { ok: false, error: "제목을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("product_assets").insert(row(inp));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true };
}

export async function updateAsset(id: string, inp: AssetInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("product_assets")
    .update({ ...row(inp), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true };
}

export async function deleteAsset(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("product_assets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true };
}
