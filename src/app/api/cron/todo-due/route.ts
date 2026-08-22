import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { notifyUsers } from "@/lib/notify";
import { seoulToday } from "@/lib/time";
import { sendSmsCore } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 매일 아침, 오늘 마감 또는 지연된 진행 업무를 담당자에게 알림(인앱+푸시).
// vercel.json schedule: "0 22 * * *" (= 07:00 Asia/Seoul).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = seoulToday();
  const svc = createSupabaseServiceClient();

  // 진행 중(예정/진행)이고 마감일이 오늘 이하인 업무.
  const sel = "id, title, due_date, status, assignee_user_id, assignee_user_ids";
  let rows: Record<string, unknown>[] = [];
  const res = await svc.from("todos").select(sel).in("status", ["예정", "진행"]).lte("due_date", today);
  if (res.error) {
    const res2 = await svc
      .from("todos")
      .select("id, title, due_date, status, assignee_user_id")
      .in("status", ["예정", "진행"])
      .lte("due_date", today);
    rows = (res2.data ?? []) as Record<string, unknown>[];
  } else {
    rows = (res.data ?? []) as Record<string, unknown>[];
  }

  // 사용자별 항목 취합(문자 1통으로 묶어 보내기 위함).
  const byUser = new Map<string, { title: string; due: string; overdue: boolean }[]>();

  let notified = 0;
  for (const r of rows) {
    const ids = Array.isArray(r.assignee_user_ids)
      ? (r.assignee_user_ids as string[])
      : r.assignee_user_id
      ? [r.assignee_user_id as string]
      : [];
    if (!ids.length) continue;
    const due = String(r.due_date ?? "");
    const overdue = due < today;
    for (const id of ids) {
      (byUser.get(id) ?? byUser.set(id, []).get(id)!).push({ title: String(r.title ?? "업무"), due, overdue });
    }
    await notifyUsers({
      userIds: ids,
      type: "todo_due",
      title: `${overdue ? "⏰ 지연" : "오늘 마감"}: ${String(r.title ?? "업무")}`,
      body: overdue ? `마감일(${due})이 지났습니다.` : "오늘까지 마감입니다.",
      link: "/todos",
    });
    notified++;
  }

  // 담당자 휴대폰(users.phone)이 등록돼 있으면 사용자당 요약 문자 1통 발송.
  // phone 컬럼 미적용(0089 전)이나 SOLAPI 미설정이면 조용히 건너뛴다.
  let smsSent = 0;
  if (byUser.size > 0) {
    try {
      const { data: urows, error } = await svc.from("users").select("id, phone").in("id", [...byUser.keys()]);
      if (!error) {
        for (const u of (urows ?? []) as { id: string; phone: string | null }[]) {
          const phone = (u.phone ?? "").replace(/[^\d]/g, "");
          const items = byUser.get(u.id) ?? [];
          if (phone.length < 9 || !items.length) continue;
          const late = items.filter((i) => i.overdue);
          const todayDue = items.filter((i) => !i.overdue);
          const line = (arr: typeof items) => arr.slice(0, 5).map((i) => `· ${i.title}`).join("\n") + (arr.length > 5 ? `\n· 외 ${arr.length - 5}건` : "");
          const text = [
            `[운호컴퍼니] 업무 마감 알림 (${today})`,
            late.length ? `⏰ 지연 ${late.length}건\n${line(late)}` : "",
            todayDue.length ? `📌 오늘 마감 ${todayDue.length}건\n${line(todayDue)}` : "",
            "확인: unho.vercel.app/todos",
          ].filter(Boolean).join("\n\n");
          const r = await sendSmsCore([phone], text);
          if (r.ok) smsSent += r.sent ?? 1;
          if (r.needsSetup) break; // SOLAPI 미설정 — 나머지도 불가하므로 중단
        }
      }
    } catch { /* 문자 실패는 무시(인앱 알림은 이미 발송됨) */ }
  }

  return NextResponse.json({ ok: true, checked: rows.length, notified, smsSent });
}
