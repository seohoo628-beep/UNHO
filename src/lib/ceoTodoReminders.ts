import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { sendEmail, escapeHtml } from "@/lib/email";
import { notifyUsers } from "@/lib/notify";
import { seoulToday } from "@/lib/time";

export type ReminderResult = {
  ok: boolean;
  sent: boolean;
  dueToday: number;
  due3: number;
  error?: string;
  skipped?: boolean;
};

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00+09:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// CEO 투두 마감 3일 전·당일 항목을 이메일 + 모바일(인앱/푸시)로 알림.
export async function sendCeoDueReminders(): Promise<ReminderResult> {
  const to = process.env.CEO_TODO_EMAIL || "seohoo628@gmail.com";
  const today = seoulToday();
  const in3 = addDays(today, 3);
  const svc = createSupabaseServiceClient();

  const { data, error } = await svc
    .from("ceo_todos")
    .select("text, cat, pri, link, due_date")
    .eq("done", false)
    .in("due_date", [today, in3]);

  if (error) {
    // due_date 컬럼이 아직 없으면 조용히 skip.
    if (error.code === "42703" || /due_date/.test(error.message ?? "")) {
      return { ok: true, sent: false, dueToday: 0, due3: 0, skipped: true };
    }
    return { ok: false, sent: false, dueToday: 0, due3: 0, error: error.message };
  }

  const rows = (data ?? []) as { text: string; cat: string | null; link: string | null; due_date: string }[];
  const todayItems = rows.filter((r) => r.due_date === today);
  const soonItems = rows.filter((r) => r.due_date === in3);
  if (todayItems.length === 0 && soonItems.length === 0) {
    return { ok: true, sent: false, dueToday: 0, due3: 0 };
  }

  const dateLabel = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

  const section = (title: string, color: string, items: typeof rows) => {
    if (!items.length) return "";
    const lis = items
      .map((it) => {
        const cat = it.cat ? `<span style="color:#6b7280;font-size:12px"> · ${escapeHtml(it.cat)}</span>` : "";
        const link = it.link ? ` <a href="${escapeHtml(it.link)}" style="color:#2563eb;font-size:12px">🔗</a>` : "";
        return `<li style="padding:6px 0;color:#111827;line-height:1.5">${escapeHtml(it.text)}${cat}${link}</li>`;
      })
      .join("");
    return `<h3 style="margin:16px 0 4px;font-size:15px;color:${color}">${escapeHtml(title)} (${items.length})</h3><ul style="margin:0;padding-left:18px">${lis}</ul>`;
  };

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
    <p style="font-size:13px;color:#6b7280;margin:0 0 4px">${escapeHtml(dateLabel)} · CEO 투두 마감 알림</p>
    <h2 style="margin:0 0 6px;font-size:19px;color:#dc2626">⏰ 마감 임박 CEO 투두</h2>
    ${section("오늘 마감", "#dc2626", todayItems)}
    ${section("3일 후 마감", "#b45309", soonItems)}
    <p style="margin:18px 0 0;font-size:12px;color:#9ca3af">운호컴퍼니 운영 플랫폼 · CEO 투두 자동 알림</p>
  </div>`;

  const text =
    `[${dateLabel}] CEO 투두 마감 알림\n\n` +
    (todayItems.length ? `■ 오늘 마감 (${todayItems.length})\n` + todayItems.map((i) => `- ${i.text}`).join("\n") + "\n\n" : "") +
    (soonItems.length ? `■ 3일 후 마감 (${soonItems.length})\n` + soonItems.map((i) => `- ${i.text}`).join("\n") : "");

  // 이메일
  const r = await sendEmail({ to, subject: `[CEO 투두] 마감 임박 · 오늘 ${todayItems.length} / 3일후 ${soonItems.length}`, html, text });

  // 모바일(인앱+푸시) — 대표 계정으로
  try {
    const { data: owners } = await svc.from("users").select("id").eq("role", "owner");
    const ownerIds = ((owners ?? []) as { id: string }[]).map((o) => o.id);
    if (ownerIds.length) {
      const parts: string[] = [];
      if (todayItems.length) parts.push(`오늘 마감 ${todayItems.length}건`);
      if (soonItems.length) parts.push(`3일 후 ${soonItems.length}건`);
      await notifyUsers({
        userIds: ownerIds,
        type: "todo_due",
        title: `⏰ CEO 투두 마감 임박`,
        body: parts.join(" · "),
        link: "/ceo-todos",
      });
    }
  } catch {
    /* 푸시 실패 무시 */
  }

  if (r.skipped) return { ok: true, sent: false, dueToday: todayItems.length, due3: soonItems.length, skipped: true };
  return { ok: r.ok, sent: !!r.ok, dueToday: todayItems.length, due3: soonItems.length, error: r.ok ? undefined : r.error };
}
