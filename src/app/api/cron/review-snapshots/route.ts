import { NextResponse } from "next/server";
import { searchShop } from "@/lib/shopsearch";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { recentShopQueries, storeSnapshots } from "@/lib/reviewSnapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 경쟁 제품 리뷰 스냅샷 자동 재검색.
 * vercel.json schedule: "0 21 * * *" (= 06:00 Asia/Seoul, 매일).
 *
 * 판매건수는 리뷰 증분으로 추정하는데, 증분은 스냅샷이 이틀치 이상 있어야
 * 나온다. 최근 60일 안에 실제로 쓰인 검색어를 사람 없이 재검색해 그날 리뷰수를
 * 쌓는다 — 화면에서 검색만 해 두면 다음 날부터 판매건수가 저절로 찬다.
 *
 * 검색어 하나가 실패해도 나머지는 계속 돈다. 11번가를 몰아치지 않도록
 * 순차로 부른다(최대 40개 — 검색어 기록의 limit).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = createSupabaseServiceClient();
  let queries: string[];
  try {
    queries = await recentShopQueries(db, {});
  } catch (e) {
    // 0089 마이그레이션 전이면 기록 테이블이 없다 — 오류로 알려 조치하게 한다.
    const msg = e instanceof Error ? e.message : "검색어 기록을 읽지 못했습니다";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  let snapshots = 0;
  const failed: string[] = [];
  for (const q of queries) {
    try {
      snapshots += await storeSnapshots(db, await searchShop(q, 50));
    } catch {
      failed.push(q);
    }
  }
  return NextResponse.json({ ok: true, queries: queries.length, snapshots, failed });
}
