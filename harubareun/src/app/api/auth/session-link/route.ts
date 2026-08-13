import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 비밀번호 로그인 성공 직후 호출된다.
// 현재 세션의 이메일이 users 에 등록돼 있는지 확인하고(미등록이면 차단),
// 최초 로그인이면 auth_id 를 연결한다.
export async function POST() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ ok: false, error: "no-session" }, { status: 401 });
  }

  const svc = createSupabaseServiceClient();
  const { data: existing } = await svc
    .from("users")
    .select("id, auth_id, active")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  if (!existing || !existing.active) {
    await supabase.auth.signOut();
    return NextResponse.json({ ok: false, error: "no-account" });
  }

  if (!existing.auth_id) {
    await svc.from("users").update({ auth_id: user.id }).eq("id", existing.id);
  } else if (existing.auth_id !== user.id) {
    // 이메일은 같은데 auth 사용자 id 가 바뀐 경우(재생성 등) 최신 id 로 갱신
    await svc.from("users").update({ auth_id: user.id }).eq("id", existing.id);
  }

  return NextResponse.json({ ok: true });
}
