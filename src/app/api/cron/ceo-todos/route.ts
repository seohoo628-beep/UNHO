import { NextResponse } from "next/server";
import { sendCeoTodoDigest } from "@/lib/ceoTodoDigest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 아침마다 CEO 투두 '당장실행' 항목을 seohoo628 지메일로 직접 발송(Resend).
// vercel.json schedule: "0 22 * * *" (= 07:00 Asia/Seoul).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await sendCeoTodoDigest();
  return NextResponse.json(r);
}
