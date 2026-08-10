import { NextResponse } from "next/server";
import { sendMorningBrief } from "@/lib/morningBrief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 매일 아침 CEO 아침 브리핑 생성·저장 + 이메일 발송.
// vercel.json schedule: "0 22 * * *" (= 07:00 Asia/Seoul).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await sendMorningBrief();
  return NextResponse.json(r);
}
