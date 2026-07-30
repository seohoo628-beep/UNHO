import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import { kakaoAuthorizeUrl, kakaoRestKey } from "@/lib/notify/kakao";

export const dynamic = "force-dynamic";

// 대표가 카카오 알림을 연결하기 시작하는 진입점. 카카오 인증 화면으로 보낸다.
export async function GET() {
  const user = await getAppUserOrNull();
  if (!user || user.role !== "owner") {
    return NextResponse.json({ error: "대표만 연결할 수 있습니다." }, { status: 403 });
  }
  if (!kakaoRestKey()) {
    return NextResponse.json(
      { error: "KAKAO_REST_API_KEY 가 설정되지 않았습니다." },
      { status: 400 }
    );
  }
  return NextResponse.redirect(kakaoAuthorizeUrl());
}
