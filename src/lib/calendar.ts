// 구글 캘린더(개인 계정 포함) 오늘 일정 — 비공개 iCal(.ics) 주소로 읽는다.
// 서비스계정 위임은 Workspace 도메인 계정만 가능해, 개인 gmail 캘린더는 iCal이 유일한 무연동 방법.
// 설정: 구글 캘린더 → 설정 → '내 캘린더 설정' → 비공개 주소(ICAL) 복사 → 환경변수 CALENDAR_ICAL_URL.

export type CalEvent = { title: string; time: string; ts: number };

const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function calendarConfigured(): boolean {
  return !!process.env.CALENDAR_ICAL_URL;
}

// 접힌 라인(다음 줄이 공백/탭으로 시작) 펼치기.
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const ln of raw) {
    if ((ln.startsWith(" ") || ln.startsWith("\t")) && out.length) out[out.length - 1] += ln.slice(1);
    else out.push(ln);
  }
  return out;
}

// YYYYMMDD 또는 YYYYMMDDTHHMMSS(Z) → {ymd(KST), timeLabel, ts}
function parseDT(val: string, isDate: boolean): { ymd: string; label: string; ts: number } {
  if (isDate || /^\d{8}$/.test(val)) {
    const y = val.slice(0, 4), m = val.slice(4, 6), d = val.slice(6, 8);
    return { ymd: `${y}-${m}-${d}`, label: "종일", ts: Date.parse(`${y}-${m}-${d}T00:00:00+09:00`) };
  }
  const mt = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!mt) return { ymd: "", label: "", ts: 0 };
  const [, y, mo, d, h, mi, s, z] = mt;
  const iso = z ? `${y}-${mo}-${d}T${h}:${mi}:${s}Z` : `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
  const dt = new Date(iso);
  const kst = new Date(dt.getTime() + (z ? 9 * 3600000 : 0));
  const ymd = z
    ? kst.toISOString().slice(0, 10)
    : `${y}-${mo}-${d}`;
  const label = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(dt);
  return { ymd, label, ts: dt.getTime() };
}

function occursToday(props: Record<string, string>, today: string): boolean {
  const dtRaw = props["DTSTART"] ?? "";
  const isDate = /^\d{8}$/.test(dtRaw);
  const start = parseDT(dtRaw, isDate);
  if (!start.ymd) return false;
  const rrule = props["RRULE"] ?? "";

  // 반복 일정(매일/매주/매년 리마인더 등)은 제외 — 오늘 실제로 잡힌 일회성 일정만.
  // (CALENDAR_INCLUDE_RECURRING=1 로 켜면 반복도 포함)
  if (rrule && process.env.CALENDAR_INCLUDE_RECURRING !== "1") return false;

  // 종일 다중일: DTSTART..DTEND 범위에 today 포함
  if (!rrule) {
    if (start.ymd === today) return true;
    const dtend = props["DTEND"];
    if (dtend && /^\d{8}$/.test(dtend)) {
      const end = parseDT(dtend, true);
      return start.ymd <= today && today < end.ymd; // iCal DTEND(종일)은 배타적
    }
    return false;
  }

  // (옵션) 반복: FREQ 기준 today 매칭(UNTIL만 존중, COUNT는 근사)
  const freq = (rrule.match(/FREQ=([A-Z]+)/) || [])[1] || "";
  const until = (rrule.match(/UNTIL=([0-9T]+)/) || [])[1];
  if (until) {
    const u = parseDT(until, until.length === 8);
    if (u.ymd && today > u.ymd) return false;
  }
  if (today < start.ymd) return false;
  const tm = today.slice(5, 7), td = today.slice(8, 10);
  const twd = WD[new Date(`${today}T12:00:00+09:00`).getUTCDay()];
  const sMonth = start.ymd.slice(5, 7), sDay = start.ymd.slice(8, 10);
  switch (freq) {
    case "DAILY": return true;
    case "WEEKLY": {
      const byday = (rrule.match(/BYDAY=([A-Z,]+)/) || [])[1];
      const days = byday
        ? byday.split(",").map((x) => x.slice(-2))
        : [WD[new Date(`${start.ymd}T12:00:00+09:00`).getUTCDay()]];
      return days.includes(twd);
    }
    case "MONTHLY": return td === sDay;
    case "YEARLY": return tm === sMonth && td === sDay;
    default: return false;
  }
}

// 진단: 어디서 막히는지 확인용(설정 여부/HTTP 상태/전체 VEVENT 수/오늘 매칭 수/샘플).
export async function diagnoseCalendar(today: string): Promise<{
  configured: boolean; ok: boolean; status?: number; bytes?: number;
  vevents?: number; todayCount?: number; sampleStarts?: string[]; error?: string;
}> {
  const url = process.env.CALENDAR_ICAL_URL;
  if (!url) return { configured: false, ok: false, error: "CALENDAR_ICAL_URL 환경변수가 없습니다." };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) return { configured: true, ok: false, status: res.status, bytes: text.length, error: `HTTP ${res.status}` };
    const lines = unfold(text);
    const starts: string[] = [];
    let vevents = 0; let cur: Record<string, string> | null = null;
    for (const ln of lines) {
      if (ln === "BEGIN:VEVENT") { cur = {}; vevents++; }
      else if (ln === "END:VEVENT") { if (cur && starts.length < 6) { const dt = cur["DTSTART"] ?? ""; starts.push(dt); } cur = null; }
      else if (cur) { const i = ln.indexOf(":"); if (i > 0) cur[ln.slice(0, i).split(";")[0]] = ln.slice(i + 1); }
    }
    const todayCount = (await getTodayCalendarEvents(today)).length;
    return { configured: true, ok: true, status: res.status, bytes: text.length, vevents, todayCount, sampleStarts: starts };
  } catch (e) {
    return { configured: true, ok: false, error: e instanceof Error ? e.message : "조회 오류" };
  } finally {
    clearTimeout(timer);
  }
}

export async function getTodayCalendarEvents(today: string): Promise<CalEvent[]> {
  const url = process.env.CALENDAR_ICAL_URL;
  if (!url) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return [];
    const lines = unfold(await res.text());
    const events: CalEvent[] = [];
    let cur: Record<string, string> | null = null;
    for (const ln of lines) {
      if (ln === "BEGIN:VEVENT") cur = {};
      else if (ln === "END:VEVENT") {
        if (cur && occursToday(cur, today)) {
          const dt = cur["DTSTART"] ?? "";
          const isDate = /^\d{8}$/.test(dt);
          const p = parseDT(dt, isDate);
          const title = (cur["SUMMARY"] || "(제목 없음)").replace(/\\,/g, ",").replace(/\\n/g, " ").trim();
          events.push({ title, time: p.label || "종일", ts: p.ts });
        }
        cur = null;
      } else if (cur) {
        const idx = ln.indexOf(":");
        if (idx > 0) {
          const keyFull = ln.slice(0, idx);
          const key = keyFull.split(";")[0];
          const val = ln.slice(idx + 1);
          // DTSTART;VALUE=DATE 같은 파라미터 보존을 위해 원키도 저장
          cur[key] = val;
          if (/VALUE=DATE/i.test(keyFull) && key === "DTSTART") cur["DTSTART"] = val; // 이미 저장됨
        }
      }
    }
    return events.sort((a, b) => a.ts - b.ts);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
