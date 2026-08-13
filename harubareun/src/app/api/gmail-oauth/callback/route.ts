import { NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { exchangeCode } from "@/lib/gmailPersonal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <div style="font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#1f2430;word-break:keep-all">
      <h2 style="font-size:20px">${title}</h2>${body}
      <p style="margin-top:24px"><a href="/morning-brief" style="color:#2563eb">← CEO 아침 브리핑으로 돌아가기</a></p>
    </div>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// 구글 동의 후 콜백: 인가코드 → refresh token 교환 후 화면에 표시(대표만).
export async function GET(req: Request) {
  let user;
  try {
    user = await requireAppUser();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (!isCeoUser(user)) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err) return page("연동 취소됨", `<p>구글 동의가 취소되었습니다 (${err}).</p>`);
  if (!code) return page("오류", "<p>인가 코드가 없습니다. 다시 시도해 주세요.</p>");

  const redirectUri = `${url.origin}/api/gmail-oauth/callback`;
  const r = await exchangeCode(code, redirectUri);
  if (!r.ok || !r.refreshToken) {
    return page("연동 실패", `<p style="color:#dc2626">${r.error ?? "refresh token 발급 실패"}</p><p>구글 계정 선택 화면에서 <b>본인 개인 지메일</b>로 로그인하고 모든 권한에 동의했는지 확인하세요.</p>`);
  }
  return page(
    "✅ 지메일 연동 코드 발급 완료",
    `<p>아래 <b>refresh token</b>을 복사해 Vercel 환경변수 <code>GMAIL_OAUTH_REFRESH_TOKEN</code> 에 저장한 뒤 재배포하면 개인 지메일 연동이 완료됩니다.</p>
     <textarea readonly style="width:100%;height:90px;font-size:12px;padding:10px;border:1px solid #ccc;border-radius:8px;margin-top:8px">${r.refreshToken}</textarea>
     <p style="font-size:13px;color:#6b7280;margin-top:8px">⚠️ 이 값은 개인 메일 접근 권한이 담긴 비밀키입니다. 외부에 노출하지 마세요.</p>`
  );
}
