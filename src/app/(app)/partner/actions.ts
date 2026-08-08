"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function staffGuard() {
  const u = await requireAppUser();
  return u.role === "owner" || u.role === "staff" ? u : null;
}

function parseFiles(v: FormDataEntryValue | null): { url: string; name: string }[] {
  try {
    const arr = JSON.parse(String(v ?? "[]"));
    if (!Array.isArray(arr)) return [];
    return arr.filter((f) => f && typeof f.url === "string").map((f) => ({ url: f.url, name: String(f.name ?? "file") }));
  } catch {
    return [];
  }
}

export async function createPartnerPost(fd: FormData): Promise<Result> {
  const user = await staffGuard();
  if (!user) return { ok: false, error: "대표·직원만 올릴 수 있습니다." };
  const title = String(fd.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "제목을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("partner_posts").insert({
    title,
    body: String(fd.get("body") ?? "").trim() || null,
    link: String(fd.get("link") ?? "").trim() || null,
    files: parseFiles(fd.get("files_json")),
    created_by: user.id,
  });
  if (error) {
    const tableMissing = error.code === "42P01" || /partner_posts/.test(error.message ?? "");
    return { ok: false, error: error.message, tableMissing };
  }
  revalidatePath("/partner");
  return { ok: true };
}

export async function deletePartnerPost(id: string): Promise<Result> {
  const user = await staffGuard();
  if (!user) return { ok: false, error: "대표·직원만 삭제할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("partner_posts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner");
  return { ok: true };
}
