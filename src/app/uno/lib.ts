// UNO 자기 관리 — 날짜·통계 순수 함수 모음.
import type { DailyLog, Goal, UnoState } from "./types";

// ── 날짜 유틸 (로컬 타임존 기준) ──────────────────────────
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayYmd(): string {
  return ymd(new Date());
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

// 월요일 시작 주의 시작일
export function startOfWeek(s: string): string {
  const d = parseYmd(s);
  const dow = (d.getDay() + 6) % 7; // 월=0 … 일=6
  d.setDate(d.getDate() - dow);
  return ymd(d);
}

export function startOfMonth(s: string): string {
  const d = parseYmd(s);
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}

// [from, to] 범위의 날짜 배열(포함)
export function rangeDates(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 1000) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

// 최근 n일 (오늘 포함)
export function lastNDays(n: number, end = todayYmd()): string[] {
  return rangeDates(addDays(end, -(n - 1)), end);
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
export function weekdayKo(s: string): string {
  return WEEKDAY[parseYmd(s).getDay()];
}

export function shortDate(s: string): string {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── 로그 파생값 ────────────────────────────────────────
// 취침~기상으로 수면 시간 계산(자정 넘김 처리)
export function computeSleepHours(bedtime?: string, wake?: string): number | undefined {
  if (!bedtime || !wake) return undefined;
  const [bh, bm] = bedtime.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  if ([bh, bm, wh, wm].some((v) => Number.isNaN(v))) return undefined;
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins < 0) mins += 24 * 60; // 다음 날 기상
  return Math.round((mins / 60) * 10) / 10;
}

export function sleepHoursOf(log?: DailyLog): number {
  if (!log?.sleep) return 0;
  if (typeof log.sleep.hours === "number") return log.sleep.hours;
  return computeSleepHours(log.sleep.bedtime, log.sleep.wake) ?? 0;
}

export function studyTotalOf(log?: DailyLog): number {
  const s = log?.study;
  if (!s) return 0;
  return (s.english || 0) + (s.business || 0) + (s.ai || 0);
}

// 그날 무언가 기록됐는지(스트릭·달력용)
export function hasAnyEntry(log?: DailyLog): boolean {
  if (!log) return false;
  return Boolean(
    log.sleep?.bedtime ||
      log.sleep?.wake ||
      log.sleep?.hours ||
      log.exercise?.done ||
      log.reading?.minutes ||
      log.reading?.pages ||
      studyTotalOf(log) ||
      log.work?.done ||
      log.work?.focusHours ||
      log.wellbeing?.mood ||
      log.note,
  );
}

export type Metric = {
  key: string;
  label: string;
  emoji: string;
  value: (log?: DailyLog) => number;
  active: (log?: DailyLog) => boolean; // 스트릭 판정
  unit?: string;
};

export const METRICS: Metric[] = [
  {
    key: "sleep",
    label: "수면",
    emoji: "😴",
    unit: "시간",
    value: (l) => sleepHoursOf(l),
    active: (l) => sleepHoursOf(l) > 0,
  },
  {
    key: "exercise",
    label: "운동",
    emoji: "🏋️",
    unit: "분",
    value: (l) => l?.exercise?.minutes || (l?.exercise?.done ? 1 : 0),
    active: (l) => Boolean(l?.exercise?.done),
  },
  {
    key: "reading",
    label: "독서",
    emoji: "📖",
    unit: "분",
    value: (l) => l?.reading?.minutes || 0,
    active: (l) => (l?.reading?.minutes || 0) > 0,
  },
  {
    key: "study",
    label: "공부",
    emoji: "📚",
    unit: "분",
    value: (l) => studyTotalOf(l),
    active: (l) => studyTotalOf(l) > 0,
  },
  {
    key: "work",
    label: "업무",
    emoji: "💼",
    unit: "건",
    value: (l) => l?.work?.done || 0,
    active: (l) => (l?.work?.done || 0) > 0,
  },
];

// 오늘부터 거슬러 올라가며 연속 기록 일수
export function streakFor(
  logs: Record<string, DailyLog>,
  active: (log?: DailyLog) => boolean,
  end = todayYmd(),
): number {
  let streak = 0;
  let cur = end;
  // 오늘 기록이 아직 없으면 어제부터 카운트(오늘 놓쳤다고 스트릭 0으로 만들지 않음)
  if (!active(logs[cur])) cur = addDays(cur, -1);
  let guard = 0;
  while (active(logs[cur]) && guard < 3660) {
    streak++;
    cur = addDays(cur, -1);
    guard++;
  }
  return streak;
}

export function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

export function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return sum(nums) / nums.length;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── 목표 진행률 ────────────────────────────────────────
export function goalProgress(goal: Goal, state: UnoState, ref = todayYmd()): { value: number; ratio: number } {
  const from = goal.period === "week" ? startOfWeek(ref) : startOfMonth(ref);
  const dates = rangeDates(from, ref);
  const logs = dates.map((d) => state.logs[d]);
  let value = 0;
  switch (goal.metric) {
    case "exerciseDays":
      value = logs.filter((l) => l?.exercise?.done).length;
      break;
    case "studyMinutes":
      value = sum(logs.map(studyTotalOf));
      break;
    case "readingMinutes":
      value = sum(logs.map((l) => l?.reading?.minutes || 0));
      break;
    case "workDone":
      value = sum(logs.map((l) => l?.work?.done || 0));
      break;
    case "sleepAvgHours": {
      const hrs = logs.map(sleepHoursOf).filter((h) => h > 0);
      value = round1(avg(hrs));
      break;
    }
  }
  const ratio = goal.target > 0 ? Math.min(value / goal.target, 1) : 0;
  return { value, ratio };
}

// 랜덤 없이 안정적인 id
export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(performance.now() % 1e6).toString(36)}`;
}
