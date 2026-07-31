import { NextResponse } from "next/server";
import { runMarketerForAllEnabled } from "@/lib/agents/run";
import { sendKakaoMemo, isKakaoLinked } from "@/lib/notify/kakao";
import { buildMorningSummary } from "@/lib/notify/summary";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { fetchPnlRows, extractPnlKpis } from "@/lib/pnl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  // P&L 오늘자 스냅샷 저장(시트 읽기 성공 시). 실패해도 cron 은 계속.
  try {
    const sheet = await fetchPnlRows();
    if (sheet.ok && sheet.rows) {
      const kpi = extractPnlKpis(sheet.rows);
      await createSupabaseServiceClient().from("pnl_snapshots").insert({ ...kpi, raw: kpi });
    }
  } catch {
    /* P&L 스냅샷 실패 무시 */
  }

  // 대표 아침 카톡 브리핑(연결돼 있으면). 실패해도 cron 은 계속.
  let notified = false;
  try {
    if (await isKakaoLinked()) {
      const text = await buildMorningSummary();
      const r = await sendKakaoMemo(text);
      notified = r.ok;
    }
  } catch {
    /* 알림 실패 무시 */
  }

  const summary = {
    notified,
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
