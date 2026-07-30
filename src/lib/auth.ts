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

  const { data: appUser } = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!appUser) redirect("/login?e=no-account");
  return appUser as AppUser;
}

export async function getAppUserOrNull(): Promise<AppUser | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", user.id)
    .maybeSingle();
  return (data as AppUser) ?? null;
}
