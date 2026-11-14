import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/types";

/**
 * 현재 로그인한 사용자(users 행). 세션이 없거나 활성 계정이 없으면 로그인으로 보낸다.
 * 요청당 1회만 실행(React cache).
 */
export const requireAppUser = cache(async function requireAppUser(): Promise<AppUser> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const byAuth = await supabase.from("users").select("*").eq("auth_id", user.id).eq("active", true).maybeSingle();
  let found = (byAuth.data as AppUser | null) ?? null;
  if (!found && user.email) {
    const byEmail = await supabase.from("users").select("*").eq("email", user.email.toLowerCase()).eq("active", true).maybeSingle();
    found = (byEmail.data as AppUser | null) ?? null;
  }
  if (!found) redirect("/login?e=no-account");
  return found;
});
