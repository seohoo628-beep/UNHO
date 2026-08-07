import { NextResponse } from "next/server";
import { sendCeoTodoDigest } from "@/lib/ceoTodoDigest";
import { sendCeoDueReminders } from "@/lib/ceoTodoReminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 아침마다 (1) CEO 투두 '당장실행' 다이제스트 발송, (2) 마감 3일 전·당일 알림(이메일+모바일).
// vercel.json schedule: "0 22 * * *" (= 07:00 Asia/Seoul).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const digest = await sendCeoTodoDigest();
  const reminders = await sendCeoDueReminders();
  return NextResponse.json({ digest, reminders });
}
