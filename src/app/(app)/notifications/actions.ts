"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function listMyNotifications(): Promise<{
  ok: boolean;
  items?: AppNotification[];
  unread?: number;
  error?: string;
  tableMissing?: boolean;
}> {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    const tableMissing = error.code === "42P01" || /notifications/.test(error.message ?? "");
    return { ok: false, error: error.message, tableMissing };
  }
  const rows = (data ?? []) as {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }[];
  const items: AppNotification[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
  const unread = items.filter((i) => !i.readAt).length;
  return { ok: true, items, unread };
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  revalidatePath("/");
  return { ok: true };
}

// ── 웹푸시 구독 저장/해제 ─────────────────────────────────────
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ ok: boolean; error?: string; tableMissing?: boolean }> {
  const user = await requireAppUser();
  if (!sub?.endpoint || !sub?.p256dh || !sub?.auth) return { ok: false, error: "구독 정보가 올바르지 않습니다." };
  const supabase = createSupabaseServerClient();
  // endpoint unique → 있으면 갱신(사용자 바뀔 수 있음)
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { onConflict: "endpoint" }
    );
  if (error) {
    const tableMissing = error.code === "42P01" || /push_subscriptions/.test(error.message ?? "");
    return { ok: false, error: error.message, tableMissing };
  }
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  return { ok: true };
}
