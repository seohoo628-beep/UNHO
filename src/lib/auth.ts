import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";

/**
 * 현재 로그인한 앱 사용자(users 행)를 반환한다.
 * 세션이 없거나 users 에 매칭되는 활성 계정이 없으면 로그인으로 보낸다.
 */
export async function requireAppUser(): Promise<AppUser> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
}

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
