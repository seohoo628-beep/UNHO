"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string; tableMissing?: boolean };

async function staffGuard() {
  const u = await requireAppUser();
  return u.role === "owner" || u.role === "staff" ? u : null;
}

// 파트너 협업은 게스트도 글/파일을 올릴 수 있다(직원·대표·게스트).
async function contributorGuard() {
  const u = await requireAppUser();
  return u.role === "owner" || u.role === "staff" || u.role === "guest" ? u : null;
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
  const user = await contributorGuard();
  if (!user) return { ok: false, error: "권한이 없습니다." };
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
  const user = await contributorGuard();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  // 대표·직원은 모두 삭제 가능. 게스트는 본인이 올린 글만 삭제.
  let q = supabase.from("partner_posts").delete().eq("id", id);
  if (user.role === "guest") q = q.eq("created_by", user.id);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner");
  return { ok: true };
}
