import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// STARZ 정적 앱(public/starz)이 공유 모드에 필요한 공개 설정을 물려받는 엔드포인트.
// 여기서 내려주는 두 값은 모두 NEXT_PUBLIC_* (브라우저에 공개되도록 설계된 값)이라
// 인증 없이 노출해도 기존 앱과 동일한 수준이며 비밀키(service_role)는 절대 포함하지 않는다.
export function GET() {
  return NextResponse.json({
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  });
}
