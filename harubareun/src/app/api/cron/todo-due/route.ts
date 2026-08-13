import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { notifyUsers } from "@/lib/notify";
import { seoulToday } from "@/lib/time";

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
    await notifyUsers({
      userIds: ids,
      type: "todo_due",
      title: `${overdue ? "⏰ 지연" : "오늘 마감"}: ${String(r.title ?? "업무")}`,
      body: overdue ? `마감일(${due})이 지났습니다.` : "오늘까지 마감입니다.",
      link: "/todos",
    });
    notified++;
  }

  return NextResponse.json({ ok: true, checked: rows.length, notified });
}
