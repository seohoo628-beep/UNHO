import "server-only";
import webpush from "web-push";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// VAPID 키가 설정돼 있으면 웹푸시 활성화. 없으면 인앱 알림만 저장.
let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:uc@unocompany.net", pub, priv);
    vapidReady = true;
    return true;
  } catch {
    return false;
  }
}

export type NotifyInput = {
  userIds: string[];
  type?: string;
  title: string;
  body?: string;
  link?: string;
  excludeUserId?: string; // 본인 행동으로 인한 알림에서 본인 제외
};

// 인앱 알림 저장 + (가능하면) 웹푸시 발송. 실패는 조용히 무시(호출부 흐름 보호).
export async function notifyUsers(input: NotifyInput): Promise<void> {
  try {
    const ids = [...new Set((input.userIds || []).filter(Boolean))].filter(
      (id) => id !== input.excludeUserId
    );
    if (ids.length === 0) return;
    const svc = createSupabaseServiceClient();

    // 1) 인앱 알림 저장
    const rows = ids.map((user_id) => ({
      user_id,
      type: input.type || "general",
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    }));
    await svc.from("notifications").insert(rows);

    // 2) 웹푸시(설정돼 있으면)
    if (!ensureVapid()) return;
    const { data: subs } = await svc
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", ids);
    const payload = JSON.stringify({
      title: input.title,
      body: input.body ?? "",
      link: input.link ?? "/",
    });
    await Promise.all(
      ((subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
        } catch (e: unknown) {
          // 만료/무효(404·410) 구독은 정리
          const code = (e as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) {
            await svc.from("push_subscriptions").delete().eq("id", s.id);
          }
        }
      })
    );
  } catch {
    /* 알림 실패는 무시 */
  }
}
