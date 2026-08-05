import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { sendEmail, escapeHtml } from "@/lib/email";

export type DigestResult = {
  ok: boolean;
  sent: boolean;
  count: number;
  error?: string;
  skipped?: boolean; // 메일 미설정 등으로 발송 자체를 못 함
};

// CEO 투두 '당장실행' 미완료 항목을 seohoo628 지메일로 직접 발송(Resend).
// uc@ 메일함을 거치지 않는다.
export async function sendCeoTodoDigest(): Promise<DigestResult> {
  const to = process.env.CEO_TODO_EMAIL || "seohoo628@gmail.com";

  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("ceo_todos")
    .select("text, cat, link, created_at")
    .eq("pri", "당장실행")
    .eq("done", false)
    .order("created_at", { ascending: true });

  if (error) return { ok: false, sent: false, count: 0, error: error.message };
  const items = (data ?? []) as { text: string; cat: string | null; link: string | null }[];
  if (items.length === 0) return { ok: true, sent: false, count: 0 };

  const today = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

  const rowsHtml = items
    .map((it, i) => {
      const cat = it.cat ? `<span style="color:#6b7280;font-size:12px"> · ${escapeHtml(it.cat)}</span>` : "";
      const link = it.link ? ` <a href="${escapeHtml(it.link)}" style="color:#2563eb;font-size:12px">🔗</a>` : "";
      return `<tr><td style="padding:9px 10px;border-bottom:1px solid #eee;vertical-align:top;color:#dc2626;font-weight:700">${i + 1}</td><td style="padding:9px 10px;border-bottom:1px solid #eee;color:#111827;line-height:1.5">${escapeHtml(it.text)}${cat}${link}</td></tr>`;
    })
    .join("");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
    <p style="font-size:13px;color:#6b7280;margin:0 0 4px">${escapeHtml(today)} · CEO 투두 아침 알림</p>
    <h2 style="margin:0 0 14px;font-size:19px;color:#dc2626">🔥 오늘 당장 실행 (${items.length}건)</h2>
    <table style="border-collapse:collapse;width:100%;font-size:14.5px;border:1px solid #eee;border-radius:8px;overflow:hidden">${rowsHtml}</table>
    <p style="margin:18px 0 0;font-size:12px;color:#9ca3af">운호컴퍼니 운영 플랫폼 · CEO 투두 자동 알림</p>
  </div>`;

  const text =
    `[${today}] 오늘 당장 실행 (${items.length}건)\n\n` +
    items.map((it, i) => `${i + 1}. ${it.text}${it.cat ? ` (${it.cat})` : ""}${it.link ? `\n   ${it.link}` : ""}`).join("\n");

  const r = await sendEmail({
    to,
    subject: `[CEO 투두] 오늘 당장 실행 ${items.length}건 · ${today}`,
    html,
    text,
  });

  if (r.skipped) return { ok: false, sent: false, count: items.length, skipped: true, error: "RESEND_API_KEY 미설정" };
  if (!r.ok) return { ok: false, sent: false, count: items.length, error: r.error };
  return { ok: true, sent: true, count: items.length };
}
