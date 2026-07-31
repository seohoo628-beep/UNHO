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
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("pnl_snapshots").insert({ ...kpi, raw: kpi });
  return NextResponse.json({ ok: !error, kpi, error: error?.message });
}
