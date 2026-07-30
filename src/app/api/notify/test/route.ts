import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import { sendKakaoMemo } from "@/lib/notify/kakao";
import { buildMorningSummary } from "@/lib/notify/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 대표가 테스트로 지금 요약을 자기 카톡으로 보낸다.
export async function POST() {
  const user = await getAppUserOrNull();
  if (!user || user.role !== "owner") {
    return NextResponse.json({ error: "대표만 사용할 수 있습니다." }, { status: 403 });
  }
  const text = await buildMorningSummary();
  const r = await sendKakaoMemo(text);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
