import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import { exchangeCodeAndStore } from "@/lib/notify/kakao";

export const dynamic = "force-dynamic";

// 카카오 인증 콜백. 코드를 토큰으로 바꾸고 refresh_token 을 저장한다.
export async function GET(req: Request) {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const user = await getAppUserOrNull();
  if (!user || user.role !== "owner") {
    return NextResponse.redirect(`${site}/settings?kakao=forbidden`);
  }
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.redirect(`${site}/settings?kakao=nocode`);

  const r = await exchangeCodeAndStore(code);
  return NextResponse.redirect(
    `${site}/settings?kakao=${r.ok ? "ok" : "fail"}`
  );
}
