import { NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 개인 지메일 OAuth 동의 시작(대표만). 구글 동의 화면으로 리다이렉트.
export async function GET(req: Request) {
  let user;
  try {
    user = await requireAppUser();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (!isCeoUser(user)) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  if (!clientId) {
    return new NextResponse("GMAIL_OAUTH_CLIENT_ID가 설정되지 않았습니다. 먼저 Google Cloud OAuth 클라이언트를 만들고 환경변수를 넣어주세요.", { status: 400 });
  }
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/gmail-oauth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
