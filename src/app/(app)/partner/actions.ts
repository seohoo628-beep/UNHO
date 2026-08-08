"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
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
  // 게스트는 자기 회사 방으로만, 대표·직원은 선택한 회사로.
  const partnerId = user.role === "guest" ? user.partner_id : (String(fd.get("partner_id") ?? "") || null);
  const supabase = createSupabaseServerClient();
  const base = {
    title,
    body: String(fd.get("body") ?? "").trim() || null,
    link: String(fd.get("link") ?? "").trim() || null,
    files: parseFiles(fd.get("files_json")),
    created_by: user.id,
  };
  let { error } = await supabase.from("partner_posts").insert({ ...base, partner_id: partnerId });
  if (error && (error.code === "42703" || /partner_id/.test(error.message ?? ""))) {
    ({ error } = await supabase.from("partner_posts").insert(base));
  }
  if (error) {
    const tableMissing = error.code === "42P01" || /partner_posts/.test(error.message ?? "");
    return { ok: false, error: error.message, tableMissing };
  }
  revalidatePath("/partner");
  return { ok: true };
}

// ── 게시물 댓글(양방향) ─────────────────────────────
export type PartnerComment = { id: string; body: string; authorName: string; authorId: string | null; createdAt: string };

export async function listPartnerComments(postId: string): Promise<{ ok: boolean; comments?: PartnerComment[]; error?: string }> {
  const user = await contributorGuard();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("partner_post_comments")
    .select("id, body, user_id, created_at, users:user_id(name)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const comments = ((data ?? []) as unknown as { id: string; body: string; user_id: string | null; created_at: string; users: { name: string } | null }[]).map((c) => ({
    id: c.id,
    body: c.body,
    authorName: c.users?.name || "작성자",
    authorId: c.user_id,
    createdAt: c.created_at,
  }));
  return { ok: true, comments };
}

export async function addPartnerComment(postId: string, body: string): Promise<Result> {
  const user = await contributorGuard();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const text = (body || "").trim();
  if (!text) return { ok: false, error: "내용을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("partner_post_comments").insert({ post_id: postId, user_id: user.id, body: text });
  if (error) {
    const tableMissing = error.code === "42P01" || /partner_post_comments/.test(error.message ?? "");
    return { ok: false, error: error.message, tableMissing };
  }
  revalidatePath("/partner");
  return { ok: true };
}

export async function deletePartnerComment(id: string): Promise<Result> {
  const user = await contributorGuard();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  let q = supabase.from("partner_post_comments").delete().eq("id", id);
  if (user.role === "guest") q = q.eq("user_id", user.id);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner");
  return { ok: true };
}

// 파트너 회사 생성(대표·직원).
export async function createPartnerCompany(name: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await staffGuard();
  if (!user) return { ok: false, error: "대표·직원만 가능합니다." };
  const nm = (name || "").trim();
  if (!nm) return { ok: false, error: "회사명을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("partner_companies").insert({ name: nm }).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner");
  return { ok: true, id: (data as { id: string } | null)?.id };
}

// 게스트 계정을 파트너 회사에 배정(대표·직원). service client로 users 갱신.
export async function assignGuestPartner(userId: string, partnerId: string | null): Promise<{ ok: boolean; error?: string }> {
  const user = await staffGuard();
  if (!user) return { ok: false, error: "대표·직원만 가능합니다." };
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("users").update({ partner_id: partnerId || null }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
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
