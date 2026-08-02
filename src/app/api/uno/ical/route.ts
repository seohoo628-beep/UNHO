import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ScheduleItem, UnoState } from "@/app/uno/types";

// UNO 일정 iCal(.ics) 피드. 굿캘린더·네이버·애플·아웃룩 등 iCal 구독을 지원하는
// 모든 캘린더에서 이 URL을 구독하면 우리 앱 일정이 자동으로 반영된다(단방향).
// 공개 도구이므로 service_role로 읽는다(미들웨어에서 /api/uno 공개 처리).
export const dynamic = "force-dynamic";

function esc(s?: string): string {
  return (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function ymdCompact(d: string): string {
  return d.replace(/-/g, "");
}
function hms(t: string): string {
  return t.replace(":", "") + "00";
}
function addDayCompact(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const nd = new Date(y, m - 1, day + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${nd.getFullYear()}${p(nd.getMonth() + 1)}${p(nd.getDate())}`;
}
function addHour(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const nh = (h + 1) % 24;
  return `${String(nh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function utcStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(
    d.getUTCMinutes(),
  )}${p(d.getUTCSeconds())}Z`;
}

export async function GET() {
  let schedule: ScheduleItem[] = [];
  try {
    const s = createSupabaseServiceClient();
    const { data } = await s.from("uno_state").select("data").eq("id", "default").maybeSingle();
    const st = data?.data as UnoState | undefined;
    schedule = Array.isArray(st?.schedule) ? st!.schedule : [];
  } catch {
    schedule = [];
  }

  const stamp = utcStamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UNO//self-management//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:UNO 일정",
    "NAME:UNO 일정",
    "X-WR-TIMEZONE:Asia/Seoul",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Seoul",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:KST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const it of schedule) {
    if (!it?.date || !it?.title) continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${it.id || ymdCompact(it.date)}@uno-self-mgmt`);
    lines.push(`DTSTAMP:${stamp}`);
    if (it.start) {
      const end = it.end || addHour(it.start);
      lines.push(`DTSTART;TZID=Asia/Seoul:${ymdCompact(it.date)}T${hms(it.start)}`);
      lines.push(`DTEND;TZID=Asia/Seoul:${ymdCompact(it.date)}T${hms(end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymdCompact(it.date)}`);
      lines.push(`DTEND;VALUE=DATE:${addDayCompact(it.date)}`);
    }
    lines.push(`SUMMARY:${esc(it.title)}`);
    if (it.location) lines.push(`LOCATION:${esc(it.location)}`);
    if (it.note) lines.push(`DESCRIPTION:${esc(it.note)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="uno.ics"',
      "Cache-Control": "no-store",
    },
  });
}
