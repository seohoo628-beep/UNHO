import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { fetchPnlRows, extractPnlKpis } from "@/lib/pnl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron: 평일 08:00 Asia/Seoul (= 23:00 UTC 전일, 일~목). "0 23 * * 0-4"
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sheet = await fetchPnlRows();
  if (!sheet.ok || !sheet.rows) {
    return NextResponse.json({ ok: false, error: sheet.error }, { status: 200 });
  }
  const kpi = extractPnlKpis(sheet.rows);
  // KPI를 하나도 못 찾으면 빈 행을 남기지 않는다.
  if (!Object.values(kpi).some((v) => v != null)) {
    return NextResponse.json({ ok: false, error: "no_kpi_found", kpi }, { status: 200 });
  }
  const svc = createSupabaseServiceClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  await svc.from("pnl_snapshots").delete().eq("snapshot_date", today);
  const { error } = await svc.from("pnl_snapshots").insert({ ...kpi, raw: kpi });
  return NextResponse.json({ ok: !error, kpi, error: error?.message });
}
