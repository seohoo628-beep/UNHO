import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import { sendKakaoMemo, sendTodoCheckMemo } from "@/lib/notify/kakao";
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
  // 투두 체크 멘트도 함께 발송(테스트에서도 확인 가능하게).
  const t = await sendTodoCheckMemo();
  return NextResponse.json({ ok: true, todo: t.ok, todoError: t.error });
}
