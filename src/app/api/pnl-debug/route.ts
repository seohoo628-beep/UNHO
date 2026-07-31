import { NextResponse } from "next/server";
import { getPnlSheet } from "@/lib/pnl";
import { parseCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 임시 진단용. gviz 원문(직렬화)을 그대로 확인하기 위한 엔드포인트. 진단 후 삭제.
const KEY = "unho-pnl-diag-2026";

async function grab(url: string) {
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store" });
    const text = await res.text();
    return { status: res.status, len: text.length, head: text.slice(0, 3500) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cfg = await getPnlSheet();
  const base = `https://docs.google.com/spreadsheets/d/${cfg.id}`;
  const withHeaders0 = `${base}/gviz/tq?tqx=out:csv&headers=0&gid=${cfg.gid}`;
  const noHeaderParam = `${base}/gviz/tq?tqx=out:csv&gid=${cfg.gid}`;

  const [a, b] = await Promise.all([grab(withHeaders0), grab(noHeaderParam)]);

  // parseCsv 결과 격자의 앞부분(직렬화가 어떻게 격자로 들어오는지)
  let grid: string[][] | null = null;
  if (a.head && !a.head.trim().startsWith("<")) {
    grid = parseCsv(a.head).slice(0, 8).map((r) => r.slice(0, 26));
  }

  return NextResponse.json({
    cfg,
    withHeaders0: a,
    noHeaderParam: b,
    gridPreview: grid,
  });
}
