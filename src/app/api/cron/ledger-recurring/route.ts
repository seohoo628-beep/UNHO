import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { seoulToday } from "@/lib/time";
import { materializeRecurring } from "@/lib/ledgerRecurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 매일 실행: 이번 달 반복 지출 규칙을 가계부에 자동 입력(이미 있으면 건너뜀).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const month = seoulToday().slice(0, 7);
  try {
    const created = await materializeRecurring(createSupabaseServiceClient(), month);
    return NextResponse.json({ ok: true, month, created: created ?? 0, ready: created !== null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
