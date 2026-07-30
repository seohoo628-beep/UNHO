import { NextResponse } from "next/server";
import { runAgentForAllEnabled } from "@/lib/agents/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron: 평일 10:00 Asia/Seoul (= 01:00 UTC, 월~금). "0 1 * * 1-5"
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runAgentForAllEnabled("md");
  return NextResponse.json({
    ran_at: new Date().toISOString(),
    total: results.length,
    queued: results.filter((r) => r.status === "queued").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    results,
  });
}
