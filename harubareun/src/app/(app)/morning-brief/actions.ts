"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateTodayBrief } from "@/lib/morningBrief";
import { diagnoseCalendar } from "@/lib/calendar";
import { seoulToday } from "@/lib/time";

async function guard() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) throw new Error("권한이 없습니다.");
  return user;
}

export async function generateBriefNow(): Promise<{ ok: boolean; html?: string; date?: string; error?: string; tableMissing?: boolean }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const r = await generateTodayBrief();
  if (!r.ok) return { ok: false, error: r.error, tableMissing: r.tableMissing };
  revalidatePath("/morning-brief");
  return { ok: true, html: r.html, date: r.date };
}

export async function diagnoseCalendarAction(): Promise<{ ok: boolean; text: string }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "권한 오류" };
  }
  const d = await diagnoseCalendar(seoulToday());
  if (!d.configured) return { ok: false, text: "❌ CALENDAR_ICAL_URL 환경변수가 설정되지 않았습니다 (Vercel Production에 추가 후 재배포 필요)." };
  if (!d.ok) return { ok: false, text: `❌ iCal 조회 실패: ${d.error ?? ""} ${d.status ? `(HTTP ${d.status})` : ""}. 주소가 정확한지, '비공개 주소(iCal)'가 맞는지 확인하세요.` };
  const samples = (d.sampleStarts ?? []).join(", ");
  return {
    ok: true,
    text: `✅ 연결됨 · 전체 일정 ${d.vevents}건 · 오늘 매칭 ${d.todayCount}건 · 용량 ${d.bytes ?? 0}B\n샘플 시작일: ${samples || "없음"}` +
      (d.todayCount === 0 ? "\n\n→ 오늘 일정이 0건입니다. 오늘 캘린더에 실제 일정이 있는지, 반복일정만 있는지 확인해 주세요." : ""),
  };
}

export async function fetchBrief(date: string): Promise<{ ok: boolean; html?: string; error?: string }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("morning_briefs").select("html").eq("brief_date", date).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, html: (data as { html?: string } | null)?.html ?? "" };
}

// 기간(주간·월간) 브리핑 모아보기: start~end(포함) 사이 브리핑을 최신순으로.
export async function fetchBriefsRange(start: string, end: string): Promise<{ ok: boolean; items?: { date: string; html: string }[]; error?: string }> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("morning_briefs")
    .select("brief_date, html")
    .gte("brief_date", start)
    .lte("brief_date", end)
    .order("brief_date", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []).map((r: any) => ({ date: r.brief_date, html: r.html })) };
}
