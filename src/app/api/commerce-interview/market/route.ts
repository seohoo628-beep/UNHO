import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import {
  getNaverKeys,
  shopConfigured,
  adConfigured,
  searchShop,
  keywordStats,
} from "@/lib/naver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 시장 데이터 조회. 인터뷰지 ②(경쟁 TOP10)·⑦(시즌)에서 부른다.
 *
 * - shop     : 제품명·스펙으로 경쟁 제품과 판매가를 가져온다.
 * - keywords : 키워드 월간 검색수를 가져온다.
 *
 * 판매건수·리뷰수·유입수는 네이버 공개 API 에 없다. 그 세 열은 화면에서
 * 계속 엑셀 업로드로 채운다 — 여기서 만들어내지 않는다.
 */

type Body = { action?: string; query?: string; display?: number; keywords?: string[] };

const err = (error: string, code = 400) => NextResponse.json({ ok: false, error }, { status: code });

export async function GET() {
  const user = await getAppUserOrNull();
  if (!user) return err("로그인이 필요합니다", 401);
  const k = await getNaverKeys();
  return NextResponse.json({ ok: true, shop: shopConfigured(k), ad: adConfigured(k) });
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
      const items = await searchShop(q, body.display ?? 20);
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
