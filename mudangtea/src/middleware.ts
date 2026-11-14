import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// 세션 쿠키 갱신 + 미로그인 사용자는 /login 으로. 권한 판단은 페이지가 한다.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let hasSession = true;
  try {
    const res = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((r) => setTimeout(() => r(null), 3000)),
    ]);
    if (res) hasSession = !!res.data.session;
  } catch {
    /* 판단 보류 — 페이지가 다시 검증 */
  }

  const path = request.nextUrl.pathname;
  if (!hasSession && path !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon|api/auth|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
