import { NextResponse } from "next/server";
import { runMarketerForAllEnabled } from "@/lib/agents/run";
import { sendKakaoMemo, sendTodoCheckMemo, isKakaoLinked } from "@/lib/notify/kakao";
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

  // 대표 요청으로 마케팅 콘텐츠 자동생성 중단(2026-08). 재개하려면 false로.
  // P&L 스냅샷·아침 카톡 브리핑은 그대로 유지된다.
  const CONTENT_AUTOGEN_DISABLED = true;
  const results = CONTENT_AUTOGEN_DISABLED ? [] : await runMarketerForAllEnabled();

  // P&L 오늘자 스냅샷 저장(시트 읽기 성공 시). 실패해도 cron 은 계속.
  try {
    const sheet = await fetchPnlRows();
    if (sheet.ok && sheet.rows) {
      const kpi = extractPnlKpis(sheet.rows);
      if (Object.values(kpi).some((v) => v != null)) {
        const svc = createSupabaseServiceClient();
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
        await svc.from("pnl_snapshots").delete().eq("snapshot_date", today);
        await svc.from("pnl_snapshots").insert({ ...kpi, raw: kpi });
      }
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
      // 투두 업무 체크 멘트 + 투두 보기 링크도 함께 발송.
      await sendTodoCheckMemo();
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
