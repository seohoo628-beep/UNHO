import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export const dynamic = "force-dynamic";

// 매직링크 콜백. code 를 세션으로 교환하고, 세션 쿠키를 "리다이렉트 응답 자체"에 실어
// 브라우저에 저장되게 한다(라우트 핸들러에서 새 NextResponse.redirect 를 따로 만들면
// 쿠키가 유실되어 로그인 후 다시 로그인 화면으로 튕기는 문제가 생긴다).
// 이어서 users 행의 auth_id 를 이메일로 연결한다(최초 로그인).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/drive";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? origin;

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/login?e=no-code`);
  }

  // 성공 시 돌려줄 응답. 세션 쿠키는 이 응답에 실린다.
  const response = NextResponse.redirect(`${siteUrl}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${siteUrl}/login?e=exchange`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email) {
    // 사전 등록된 users 행에 auth_id 를 연결(최초 로그인). 미등록 이메일은 차단.
    const svc = createSupabaseServiceClient();
    const { data: existing } = await svc
      .from("users")
      .select("id, auth_id")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();

    if (!existing) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${siteUrl}/login?e=no-account`);
    }
    if (!existing.auth_id) {
      await svc.from("users").update({ auth_id: user.id }).eq("id", existing.id);
    }
  }

  return response;
}
