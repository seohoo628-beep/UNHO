import { createClient } from "@supabase/supabase-js";

/**
 * service_role 클라이언트. RLS를 우회한다.
 * AI 에이전트가 산출물을 기록하거나 Cron이 시스템 작업을 할 때만,
 * 서버 라우트 안에서만 사용한다. 절대 클라이언트 번들에 들어가면 안 된다.
 */
export function createSupabaseServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
