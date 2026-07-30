import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// 매직링크 콜백. code 를 세션으로 교환하고, users 행의 auth_id 를 이메일로 연결한다.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?e=no-code`);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?e=exchange`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email) {
    // 사전 등록된 users 행에 auth_id 를 연결(최초 로그인). 미등록 이메일은 연결하지 않는다.
    const svc = createSupabaseServiceClient();
    const { data: existing } = await svc
      .from("users")
      .select("id, auth_id")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();

    if (!existing) {
      // 등록되지 않은 이메일 → 계정 없음 처리
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?e=no-account`);
    }
    if (!existing.auth_id) {
      await svc.from("users").update({ auth_id: user.id }).eq("id", existing.id);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
