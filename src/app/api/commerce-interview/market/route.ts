import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import { getNaverKeys, adConfigured, keywordStats } from "@/lib/naver";
import { getShopKey, shopConfigured, searchShop, type ShopItem } from "@/lib/shopsearch";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 시장 데이터 조회. 플랜 ②(경쟁 TOP10)·⑦(시즌)에서 부른다.
 *
 * - shop     : 제품명·스펙으로 경쟁 제품·판매가·리뷰수를 가져온다(11번가).
 * - keywords : 키워드 월간 검색수와 연관 키워드를 가져온다(네이버 검색광고).
 *
 * 판매건수는 어느 공개 API 에도 없어 리뷰 증분으로 추정한다. 검색할 때마다
 * 리뷰수를 서버(review_snapshots)에 쌓고, 이전 날짜 스냅샷을 prev 로 붙여
 * 화면이 증분을 계산하게 한다. 유입수는 여전히 엑셀 업로드뿐이다.
 */

/**
 * 리뷰 스냅샷 저장 + 직전 값 조회. 링크가 상품 식별자다(없으면 건너뛴다).
 *
 * 마이그레이션(0088)을 아직 안 돌린 환경에서도 검색 자체는 살아야 하므로,
 * 여기가 실패하면 스냅샷 없이 items 만 돌려준다 — 추정이 빠질 뿐 조회는 된다.
 */
async function attachSnapshots(items: ShopItem[]): Promise<(ShopItem & { prev?: { d: string; r: number } })[]> {
  const linked = items.filter((it) => it.link);
  if (!linked.length) return items;
  try {
    const supabase = createSupabaseServerClient();
    const links = [...new Set(linked.map((it) => it.link))];
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("review_snapshots")
      .select("link, captured_on, reviews")
      .in("link", links)
      .lt("captured_on", today)
      .order("captured_on", { ascending: false });
    if (error) throw error;
    // 링크마다 가장 최근(오늘 이전) 한 건만 쓴다.
    const prev = new Map<string, { d: string; r: number }>();
    for (const row of (data ?? []) as { link: string; captured_on: string; reviews: number }[])
      if (!prev.has(row.link)) prev.set(row.link, { d: row.captured_on, r: row.reviews });
    await supabase.from("review_snapshots").upsert(
      linked.map((it) => ({ link: it.link, captured_on: today, title: it.title, reviews: it.reviews, price: it.price })),
      { onConflict: "link,captured_on" }
    );
    return items.map((it) => (prev.has(it.link) ? { ...it, prev: prev.get(it.link) } : it));
  } catch {
    return items;
  }
}

type Body = { action?: string; query?: string; display?: number; keywords?: string[] };

const err = (error: string, code = 400) => NextResponse.json({ ok: false, error }, { status: code });

export async function GET() {
  const user = await getAppUserOrNull();
  if (!user) return err("로그인이 필요합니다", 401);
  const [k, shopKey] = await Promise.all([getNaverKeys(), getShopKey()]);
  return NextResponse.json({ ok: true, shop: shopConfigured(shopKey), ad: adConfigured(k) });
}

export async function POST(request: Request) {
  const user = await getAppUserOrNull();
  if (!user) return err("로그인이 필요합니다", 401);
  if (!["owner", "staff"].includes(user.role)) return err("권한이 없습니다", 403);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return err("본문을 읽을 수 없습니다");
  }

  try {
    if (body.action === "shop") {
      const q = (body.query ?? "").trim();
      if (!q) return err("검색어가 없습니다");
      const items = await attachSnapshots(await searchShop(q, body.display ?? 20));
      return NextResponse.json({ ok: true, query: q, items });
    }
    if (body.action === "keywords") {
      const list = (body.keywords ?? []).filter((s) => (s || "").trim());
      if (!list.length) return err("키워드가 없습니다");
      // 검색광고 API 는 5개씩 끊어 부르므로 과호출을 막기 위해 30개로 제한한다.
      const stats = await keywordStats(list.slice(0, 30));
      return NextResponse.json({ ok: true, stats });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "조회 실패";
    // 키 미설정은 사용자가 조치할 수 있는 문제라 별도 코드로 구분한다.
    return err(msg, /설정되지 않았습니다/.test(msg) ? 412 : 502);
  }
  return err("알 수 없는 요청입니다");
}
