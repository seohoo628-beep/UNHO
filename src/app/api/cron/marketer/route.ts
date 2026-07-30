import { NextResponse } from "next/server";
import { runMarketerForAllEnabled } from "@/lib/agents/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron: 평일 09:00 Asia/Seoul (= 00:00 UTC, 월~금).
// vercel.json 의 schedule "0 0 * * 1-5" 로 호출된다.
// Authorization: Bearer <CRON_SECRET> 로 보호한다.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await runMarketerForAllEnabled();
  const summary = {
    ran_at: new Date().toISOString(),
    total: results.length,
    queued: results.filter((r) => r.status === "queued").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    error: results.filter((r) => r.status === "error").length,
    results,
  };
  return NextResponse.json(summary);
}
