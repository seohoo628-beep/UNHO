import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { sendMessage, ensureLabel, addLabels, gmailConfigured } from "@/lib/gmail";
import { escapeHtml } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 아침마다 CEO 투두 '당장실행' 항목을 seohoo628 지메일로 발송.
// uc@unocompany.net 메일함에서 보내고, 보낸 사본에 '투두알림' 라벨을 붙인다.
// vercel.json schedule: "0 22 * * *" (= 07:00 Asia/Seoul).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!gmailConfigured()) {
    return NextResponse.json({ ok: false, error: "gmail not configured" });
  }

  const to = process.env.CEO_TODO_EMAIL || "seohoo628@gmail.com";
  const label = process.env.CEO_TODO_LABEL || "투두알림";

  // '당장실행' 미완료 항목만.
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("ceo_todos")
    .select("text, cat, link, created_at")
    .eq("pri", "당장실행")
    .eq("done", false)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message });
  }
  const items = (data ?? []) as { text: string; cat: string | null; link: string | null }[];
  if (items.length === 0) {
    // 당장실행 항목이 없으면 발송하지 않음(노이즈 방지).
    return NextResponse.json({ ok: true, sent: false, reason: "no 당장실행 items" });
  }

  const today = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

  const rowsHtml = items
    .map((it, i) => {
      const cat = it.cat ? `<span style="color:#6b7280;font-size:12px"> · ${escapeHtml(it.cat)}</span>` : "";
      const link = it.link
        ? ` <a href="${escapeHtml(it.link)}" style="color:#2563eb;font-size:12px">🔗</a>`
        : "";
      return `<tr><td style="padding:9px 10px;border-bottom:1px solid #eee;vertical-align:top;color:#dc2626;font-weight:700">${i + 1}</td><td style="padding:9px 10px;border-bottom:1px solid #eee;color:#111827;line-height:1.5">${escapeHtml(it.text)}${cat}${link}</td></tr>`;
    })
    .join("");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
    <p style="font-size:13px;color:#6b7280;margin:0 0 4px">${escapeHtml(today)} · CEO 투두 아침 알림</p>
    <h2 style="margin:0 0 14px;font-size:19px;color:#dc2626">🔥 오늘 당장 실행 (${items.length}건)</h2>
    <table style="border-collapse:collapse;width:100%;font-size:14.5px;border:1px solid #eee;border-radius:8px;overflow:hidden">${rowsHtml}</table>
    <p style="margin:18px 0 0;font-size:12px;color:#9ca3af">운호컴퍼니 운영 플랫폼 · CEO 투두 자동 알림</p>
  </div>`;

  const textBody =
    `[${today}] 오늘 당장 실행 (${items.length}건)\n\n` +
    items.map((it, i) => `${i + 1}. ${it.text}${it.cat ? ` (${it.cat})` : ""}${it.link ? `\n   ${it.link}` : ""}`).join("\n");

  const sent = await sendMessage({
    to,
    subject: `[CEO 투두] 오늘 당장 실행 ${items.length}건 · ${today}`,
    body: textBody,
    html,
    fromName: "운호컴퍼니 CEO 투두",
  });

  if (!sent.ok) {
    return NextResponse.json({ ok: false, error: sent.error });
  }

  // 보낸 사본에 '투두알림' 라벨 부착(실패해도 발송은 성공으로 처리).
  let labeled = false;
  if (sent.id) {
    const labelId = await ensureLabel(label);
    if (labelId) labeled = await addLabels(sent.id, [labelId]);
  }

  return NextResponse.json({ ok: true, sent: true, count: items.length, labeled });
}
