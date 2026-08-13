"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";
import { sendEmail, escapeHtml } from "@/lib/email";
import { notifyUsers } from "@/lib/notify";

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

  await notifyPartnerPost(user, title, partnerId);

  revalidatePath("/partner");
  return { ok: true };
}

// 새 글 알림(이메일 + 인앱). 실패는 무시.
async function notifyPartnerPost(
  actor: { id: string; name: string | null; role: string },
  title: string,
  partnerId: string | null
): Promise<void> {
  try {
    const svc = createSupabaseServiceClient();
    let recipients: { id: string; email: string | null; name: string | null }[] = [];
    let companyName = "";
    let companyEmail: string | null = null;
    if (partnerId) {
      const { data: comp } = await svc.from("partner_companies").select("name, email").eq("id", partnerId).maybeSingle();
      companyName = (comp as { name?: string } | null)?.name ?? "";
      companyEmail = (comp as { email?: string | null } | null)?.email ?? null;
    }
    if (actor.role === "guest") {
      const { data } = await svc.from("users").select("id, email, name").eq("role", "owner");
      recipients = (data ?? []) as typeof recipients;
    } else if (partnerId) {
      const { data } = await svc.from("users").select("id, email, name").eq("role", "guest").eq("partner_id", partnerId);
      recipients = (data ?? []) as typeof recipients;
    }
    recipients = recipients.filter((r) => r.id !== actor.id);

    // 회사 연락 이메일(직원·대표가 그 회사 방에 올린 경우)도 수신처에 추가.
    const extraEmails: string[] = [];
    if (actor.role !== "guest" && companyEmail) extraEmails.push(companyEmail);

    if (recipients.length === 0 && extraEmails.length === 0) return;

    if (recipients.length > 0)
    await notifyUsers({
      userIds: recipients.map((r) => r.id),
      type: "general",
      title: `파트너 협업 새 글: ${title}`,
      body: `${actor.name || "상대"}${companyName ? ` · ${companyName}` : ""}`,
      link: "/partner",
    });

    if (process.env.RESEND_API_KEY) {
      const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto">
        <p style="font-size:13px;color:#6b7280;margin:0 0 6px">파트너 협업 · 새 글</p>
        <h2 style="margin:0 0 12px;font-size:18px;color:#111827">🤝 ${escapeHtml(title)}</h2>
        <p style="margin:0 0 6px;color:#374151">${escapeHtml(actor.name || "상대")}님이 새 자료를 올렸습니다${companyName ? ` (${escapeHtml(companyName)})` : ""}.</p>
        <p style="margin:14px 0 0;font-size:12px;color:#9ca3af">${escapeHtml(now)} · 하루바른·나아 운영 플랫폼</p>
      </div>`;
      const sent = new Set<string>();
      for (const r of recipients) {
        if (r.email && !r.email.endsWith("@unho.local") && !sent.has(r.email)) {
          sent.add(r.email);
          await sendEmail({ subject: `[파트너 협업] ${title}`, html, to: r.email });
        }
      }
      for (const em of extraEmails) {
        if (em && !sent.has(em)) {
          sent.add(em);
          await sendEmail({ subject: `[파트너 협업] ${title}`, html, to: em });
        }
      }
    }
  } catch {
    /* 알림 실패 무시 */
  }
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

// 파트너 회사 생성(대표·직원). 연락 이메일 선택.
export async function createPartnerCompany(name: string, email?: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await staffGuard();
  if (!user) return { ok: false, error: "대표·직원만 가능합니다." };
  const nm = (name || "").trim();
  if (!nm) return { ok: false, error: "회사명을 입력하세요." };
  const em = (email || "").trim().toLowerCase() || null;
  const supabase = createSupabaseServerClient();
  const row: Record<string, unknown> = { name: nm, email: em };
  let { data, error } = await supabase.from("partner_companies").insert(row).select("id").maybeSingle();
  if (error && (error.code === "42703" || /email/.test(error.message ?? ""))) {
    ({ data, error } = await supabase.from("partner_companies").insert({ name: nm }).select("id").maybeSingle());
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner");
  return { ok: true, id: (data as { id: string } | null)?.id };
}

// 파트너 회사 연락 이메일 수정(대표·직원).
export async function updatePartnerCompanyEmail(id: string, email: string): Promise<{ ok: boolean; error?: string }> {
  const user = await staffGuard();
  if (!user) return { ok: false, error: "대표·직원만 가능합니다." };
  const em = (email || "").trim().toLowerCase() || null;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("partner_companies").update({ email: em }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner");
  return { ok: true };
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
