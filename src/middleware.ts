import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// 세션 쿠키를 갱신한다. 보호 경로 접근 시 미로그인이면 /login 으로 보낸다.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/cron") ||
    path.startsWith("/api/starz-config") || // STARZ 공유 모드 공개 설정
    path.startsWith("/fnb") || // F&B 매장관리 플랫폼: 로그인 없이 공개 접근
    path.startsWith("/dining") || // 다이닝(신미집·대운목장) 플랫폼: 로그인 없이 공개 접근
    path.startsWith("/starz"); // STARZ 아이스하키팀 플랫폼: 로그인 없이 공개 접근

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // 정적 자원과 이미지 최적화 요청은 제외
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
