import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { seoulToday } from "@/lib/time";
import { getSetting } from "@/lib/settings";
import { materializeRoutines } from "@/lib/agentRoutines";
import { runPendingRoutineTodos } from "@/lib/agents/routine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// AI 에이전트 정기 업무. vercel.json: 매일 07:10~11:10 Asia/Seoul 매시 (UTC 22~02시 10분).
// 1) 오늘 해당 루틴을 투두로 생성(중복 안전) 2) 대기 중인 루틴 투두를 회차당 최대 8건 실행.
// 경영지원의 대표 일일 보고(run_last)는 다른 부서 업무가 모두 끝난 회차에 실행되고 대표에게 알림이 간다.
// 대표가 설정(app_settings.agent_routines_enabled = 'false')으로 끄면 아무것도 하지 않는다.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const enabled = (await getSetting("agent_routines_enabled").catch(() => null)) !== "false";
  if (!enabled) {
    return NextResponse.json({ ran_at: new Date().toISOString(), disabled: true });
  }
  const today = seoulToday();
  try {
    const created = await materializeRoutines(createSupabaseServiceClient(), today);
    const results = created === null ? [] : await runPendingRoutineTodos(8);
    return NextResponse.json({
      ran_at: new Date().toISOString(),
      today,
      ready: created !== null,
      created: created ?? 0,
      ran: results.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
