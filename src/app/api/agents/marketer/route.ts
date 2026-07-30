import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import { runMarketerForBrand, runMarketerForAllEnabled } from "@/lib/agents/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 수동 실행. AI 화면의 "수동 실행" 버튼에서 호출한다.
// 대표·직원만 실행할 수 있다(AI 세션은 존재하지 않는다).
export async function POST(req: Request) {
  const user = await getAppUserOrNull();
  if (!user || (user.role !== "owner" && user.role !== "staff")) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  let payload: { brandId?: string; promo?: string; all?: boolean } = {};
  try {
    payload = await req.json();
  } catch {
    // 빈 바디 허용
  }

  try {
    if (payload.all) {
      const results = await runMarketerForAllEnabled();
      return NextResponse.json({ results });
    }
    if (!payload.brandId) {
      return NextResponse.json({ error: "brandId 가 필요합니다." }, { status: 400 });
    }
    const result = await runMarketerForBrand(payload.brandId, {
      promo: payload.promo ?? null,
    });
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "실행 실패" },
      { status: 500 }
    );
  }
}
