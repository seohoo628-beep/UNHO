"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { seoulToday } from "@/lib/time";
import { gmailConfigured, listMessages } from "@/lib/gmail";

export type BriefItem = { title: string; sub?: string | null; link: string };
export type Briefing = {
  dueSoon: BriefItem[];
  notifications: BriefItem[];
  emails: BriefItem[];
  emailMore: boolean;
  count: number;
};

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00+09:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// 접속 시 보여줄 브리핑: 마감 임박 업무 + 안 읽은 알림 + 신규 이메일.
export async function getStartupBriefing(): Promise<Briefing> {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();
  const today = seoulToday();
  const soon = addDays(today, 2);
  const empty: Briefing = { dueSoon: [], notifications: [], emails: [], emailMore: false, count: 0 };

  // 1) 마감 임박(오늘~2일) 진행 업무 (RLS로 접근 가능한 범위)
  const dueSoon: BriefItem[] = [];
  try {
    const { data } = await supabase
      .from("todos")
      .select("id, title, due_date, status")
      .in("status", ["예정", "진행"])
      .not("due_date", "is", null)
      .lte("due_date", soon)
      .order("due_date", { ascending: true })
      .limit(15);
    for (const t of (data ?? []) as { id: string; title: string; due_date: string | null }[]) {
      const overdue = (t.due_date ?? "") < today;
      dueSoon.push({ title: t.title, sub: overdue ? `지연 · ${t.due_date}` : (t.due_date === today ? "오늘 마감" : `마감 ${t.due_date}`), link: "/todos" });
    }
  } catch {
    /* ignore */
  }

  // 2) 안 읽은 알림(멘션·업무배정·파트너 업데이트·마감 등)
  const notifications: BriefItem[] = [];
  try {
    const { data } = await supabase
      .from("notifications")
      .select("title, body, link, read_at")
      .eq("user_id", user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(15);
    for (const n of (data ?? []) as { title: string; body: string | null; link: string | null }[]) {
      notifications.push({ title: n.title, sub: n.body, link: n.link || "/" });
    }
  } catch {
    /* ignore */
  }

  // 3) 신규(안 읽은) 이메일 — 대표·직원, 설정된 경우만(베스트에포트)
  const emails: BriefItem[] = [];
  let emailMore = false;
  if ((user.role === "owner" || user.role === "staff") && gmailConfigured()) {
    try {
      const r = await listMessages({ q: "is:unread in:inbox", max: 5 });
      if (r.ok && r.messages) {
        for (const m of r.messages as { subject?: string | null; from?: string | null }[]) {
          emails.push({ title: m.subject || "(제목 없음)", sub: m.from ?? null, link: "/email" });
        }
        emailMore = !!r.nextPageToken;
      }
    } catch {
      /* ignore */
    }
  }

  const count = dueSoon.length + notifications.length + emails.length;
  if (count === 0) return empty;
  return { dueSoon, notifications, emails, emailMore, count };
}
