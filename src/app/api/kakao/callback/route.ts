import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import { exchangeCodeAndStore } from "@/lib/notify/kakao";

export const dynamic = "force-dynamic";

function originOf(req: Request): string {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

// 카카오 인증 콜백. 코드를 토큰으로 바꾸고 refresh_token 을 저장한다.
export async function GET(req: Request) {
  const site = originOf(req);
  const user = await getAppUserOrNull();
  if (!user || user.role !== "owner") {
    return NextResponse.redirect(`${site}/settings?kakao=forbidden`);
  }
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.redirect(`${site}/settings?kakao=nocode`);

  // authorize 때와 동일한 redirect_uri(origin) 로 교환해야 한다.
  const r = await exchangeCodeAndStore(code, site);
  return NextResponse.redirect(`${site}/settings?kakao=${r.ok ? "ok" : "fail"}`);
}
