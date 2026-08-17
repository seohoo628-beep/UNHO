"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { seoulToday } from "@/lib/time";
import { gmailConfigured, listMessages } from "@/lib/gmail";
import { tableMissing } from "@/lib/db";
import { isDueOn, itemVisibleFor, detectRole } from "@/lib/checklist";

export type BriefItem = { title: string; sub?: string | null; link: string };
export type Briefing = {
  ceoTodos: BriefItem[];
  birthdays: BriefItem[];
  dueSoon: BriefItem[];
  checklist: BriefItem[]; // 오늘 미완료 체크리스트(내 역할 기준)
  notifications: BriefItem[];
  emails: BriefItem[];
  emailMore: boolean;
  count: number;
  partial: boolean; // 일부 쿼리가 실패해 정보가 누락됐는지(빈 결과와 구분)
};

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 접속 시 보여줄 브리핑: 마감 임박 업무 + 안 읽은 알림 + 신규 이메일.
export async function getStartupBriefing(): Promise<Briefing> {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();
  const today = seoulToday();
  const soon = addDays(today, 2);

  // CEO 투두·인적자산 생일 — 미사용 폴더라 이 플랫폼에서는 비활성(항상 빈 배열).
  const ceoTodos: BriefItem[] = [];
  const birthdays: BriefItem[] = [];

  // 쿼리 실패를 조용히 삼키지 않고 기록한다. 하나라도 실패하면 partial=true.
  let partial = false;
  const fail = (where: string, err: unknown) => {
    partial = true;
    console.error(`[briefing] ${where} 실패:`, err instanceof Error ? err.message : err);
  };

  // 1) 마감 임박(오늘~2일) 진행 업무 (RLS로 접근 가능한 범위)
  const dueSoon: BriefItem[] = [];
  try {
    const { data, error } = await supabase
      .from("todos")
      .select("id, title, due_date, status")
      .in("status", ["예정", "진행"])
      .not("due_date", "is", null)
      .lte("due_date", soon)
      .order("due_date", { ascending: true })
      .limit(15);
    if (error) fail("마감 임박 업무", error);
    for (const t of (data ?? []) as { id: string; title: string; due_date: string | null }[]) {
      const overdue = (t.due_date ?? "") < today;
      dueSoon.push({ title: t.title, sub: overdue ? `지연 · ${t.due_date}` : (t.due_date === today ? "오늘 마감" : `마감 ${t.due_date}`), link: "/todos" });
    }
  } catch (e) {
    fail("마감 임박 업무", e);
  }

  // 2) 안 읽은 알림(멘션·업무배정·파트너 업데이트·마감 등)
  const notifications: BriefItem[] = [];
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("title, body, link, read_at")
      .eq("user_id", user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) fail("알림", error);
    for (const n of (data ?? []) as { title: string; body: string | null; link: string | null }[]) {
      notifications.push({ title: n.title, sub: n.body, link: n.link || "/" });
    }
  } catch (e) {
    fail("알림", e);
  }

  // 2.5) 오늘 미완료 체크리스트(내 역할 기준). 마이그레이션 전이면 조용히 건너뜀.
  const checklist: BriefItem[] = [];
  try {
    const [itemsR, marksR] = await Promise.all([
      supabase.from("checklist_items").select("id,label,href,role,recurrence,weekday,month_day,active").eq("active", true),
      supabase.from("checklist_marks").select("item_id").eq("check_date", today).eq("user_id", user.id),
    ]);
    if (itemsR.error) { if (!tableMissing(itemsR.error, "checklist_items")) fail("체크리스트", itemsR.error); }
    else {
      const doneSet = new Set((marksR.data ?? []).map((m: any) => m.item_id));
      const viewRole = detectRole(user.job_title, user.role) ?? "";
      for (const it of (itemsR.data ?? []) as any[]) {
        if (doneSet.has(it.id)) continue;
        if (!isDueOn({ recurrence: it.recurrence ?? "daily", weekday: it.weekday ?? null, monthDay: it.month_day ?? null }, today)) continue;
        if (!itemVisibleFor({ role: it.role ?? null }, viewRole)) continue;
        checklist.push({ title: it.label, sub: null, link: it.href || "/hub" });
        if (checklist.length >= 12) break;
      }
    }
  } catch (e) {
    fail("체크리스트", e);
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
      } else if (!r.ok) {
        fail("이메일", r.error ?? "unknown");
      }
    } catch (e) {
      fail("이메일", e);
    }
  }

  const count = ceoTodos.length + birthdays.length + dueSoon.length + checklist.length + notifications.length + emails.length;
  return { ceoTodos, birthdays, dueSoon, checklist, notifications, emails, emailMore, count, partial };
}
