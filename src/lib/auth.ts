import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";

/**
 * 현재 로그인한 앱 사용자(users 행)를 반환한다.
 * 세션이 없거나 users 에 매칭되는 활성 계정이 없으면 로그인으로 보낸다.
 * React cache()로 요청당 1회만 실행 → 레이아웃과 페이지가 인증 조회를 공유(속도 개선).
 */
// 세션 사용자 식별: JWT 서명을 로컬(JWKS 캐시)로 검증하는 getClaims 를 먼저 쓴다(인증 서버 왕복 없음).
// 검증이 불가능한 환경(HS256 키·구버전)이면 getUser 로 폴백.
async function sessionIdentity(supabase: ReturnType<typeof createSupabaseServerClient>): Promise<{ id: string; email: string | null } | null> {
  try {
    const auth = supabase.auth as unknown as { getClaims?: () => Promise<{ data: { claims?: { sub?: string; email?: string } } | null; error: unknown }> };
    if (typeof auth.getClaims === "function") {
      const { data, error } = await auth.getClaims();
      const sub = data?.claims?.sub;
      if (!error && sub) return { id: sub, email: data?.claims?.email ?? null };
    }
  } catch { /* 폴백 */ }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}

export const requireAppUser = cache(async function requireAppUser(): Promise<AppUser> {
  const supabase = createSupabaseServerClient();
  const user = await sessionIdentity(supabase);

  if (!user) redirect("/login");

  // auth_id 우선 매칭, 없으면 이메일로 매칭(연결값이 어긋나도 로그인되게).
  let appUser: AppUser | null = null;
  {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("auth_id", user.id)
      .eq("active", true)
      .maybeSingle();
    appUser = (data as AppUser) ?? null;
  }
  if (!appUser && user.email) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("email", user.email.toLowerCase())
      .eq("active", true)
      .maybeSingle();
    appUser = (data as AppUser) ?? null;
  }

  if (!appUser) redirect("/login?e=no-account");
  return appUser;
});

export async function getAppUserOrNull(): Promise<AppUser | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const byAuth = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (byAuth.data) return byAuth.data as AppUser;
  if (user.email) {
    const byEmail = await supabase
      .from("users")
      .select("*")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();
    return (byEmail.data as AppUser) ?? null;
  }
  return null;
}
