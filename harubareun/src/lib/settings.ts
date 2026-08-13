import { createSupabaseServiceClient } from "@/lib/supabase/service";

// 앱 설정 key/value. cron·callback 에서 service_role 로 읽고 쓴다.
export async function getSetting(key: string): Promise<string | null> {
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  const svc = createSupabaseServiceClient();
  await svc
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}
