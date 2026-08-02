// UNO 자기 관리 — 날짜·통계 순수 함수 모음.
import type { DailyLog, Exercise, Goal, Reading, UnoState, WorkoutSession } from "./types";

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

// ── 운동/독서 다중 항목 접근자 (레거시 단일 필드 호환) ──
export function exerciseList(log?: DailyLog): Exercise[] {
  if (!log) return [];
  if (log.exercises && log.exercises.length) return log.exercises;
  const e = log.exercise;
  if (e && (e.done || e.type || e.minutes || e.count || e.intensity)) return [e];
  return [];
}
export function exerciseDone(log?: DailyLog): boolean {
  return exerciseList(log).some((e) => e.done);
}
export function exerciseMinutes(log?: DailyLog): number {
  return sum(exerciseList(log).map((e) => e.minutes || 0));
}
export function exerciseCount(log?: DailyLog): number {
  return sum(exerciseList(log).map((e) => e.count || 0));
}

export function readingList(log?: DailyLog): Reading[] {
  if (!log) return [];
  if (log.readings && log.readings.length) return log.readings;
  const r = log.reading;
  if (r && (r.minutes || r.pages || r.book)) return [r];
  return [];
}
export function readingMinutes(log?: DailyLog): number {
  return sum(readingList(log).map((r) => r.minutes || 0));
}
export function readingPages(log?: DailyLog): number {
  return sum(readingList(log).map((r) => r.pages || 0));
}

// 그날 무언가 기록됐는지(스트릭·달력용)
export function hasAnyEntry(log?: DailyLog): boolean {
  if (!log) return false;
  return Boolean(
    log.sleep?.bedtime ||
      log.sleep?.wake ||
      log.sleep?.hours ||
      exerciseDone(log) ||
      readingMinutes(log) ||
      readingPages(log) ||
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
    value: (l) => exerciseMinutes(l) || (exerciseDone(l) ? 1 : 0),
    active: (l) => exerciseDone(l),
  },
  {
    key: "reading",
    label: "독서",
    emoji: "📖",
    unit: "분",
    value: (l) => readingMinutes(l),
    active: (l) => readingMinutes(l) > 0,
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
      value = logs.filter(exerciseDone).length;
      break;
    case "studyMinutes":
      value = sum(logs.map(studyTotalOf));
      break;
    case "readingMinutes":
      value = sum(logs.map(readingMinutes));
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

// ── 운동일지(번핏 스타일) 집계 ──────────────────────────
export function sessionVolume(s: WorkoutSession): number {
  return sum((s.exercises || []).flatMap((e) => (e.sets || []).map((st) => (st.weight || 0) * (st.reps || 0))));
}
export function sessionSets(s: WorkoutSession): number {
  return sum((s.exercises || []).map((e) => (e.sets || []).length));
}
export function workoutVolumeInRange(workouts: WorkoutSession[], from: string, to: string): number {
  return sum(workouts.filter((w) => w.date >= from && w.date <= to).map(sessionVolume));
}

// 랜덤 없이 안정적인 id
export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(performance.now() % 1e6).toString(36)}`;
}

// ── 월간 유틸 ──────────────────────────────────────────
export function addMonths(ref: string, n: number): string {
  const d = parseYmd(ref);
  return ymd(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export function monthLabel(ref: string): string {
  const d = parseYmd(ref);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

export function daysInMonth(ref: string): number {
  const d = parseYmd(ref);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// 그 달의 모든 날짜(YYYY-MM-DD)
export function monthDates(ref: string): string[] {
  const first = startOfMonth(ref);
  return rangeDates(first, addDays(first, daysInMonth(ref) - 1));
}

// 월 달력 행렬(월요일 시작). 앞뒤 빈칸은 null.
export function monthMatrix(ref: string): (string | null)[][] {
  const first = startOfMonth(ref);
  const lead = (parseYmd(first).getDay() + 6) % 7; // 월=0
  const total = daysInMonth(ref);
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 0; d < total; d++) cells.push(addDays(first, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// 하루 완성도: 5개 핵심 습관 중 몇 개를 달성했나
export function dayScore(log?: DailyLog): { done: number; total: number; ratio: number } {
  const total = METRICS.length;
  const done = METRICS.filter((m) => m.active(log)).length;
  return { done, total, ratio: total ? done / total : 0 };
}

// 기간 집계(대시보드·월간 공용)
export type Aggregate = {
  activeDays: number;
  sleepAvg: number;
  exDays: number;
  exMinutes: number;
  studyMin: number;
  studyByCat: { english: number; business: number; ai: number };
  readMin: number;
  readPages: number;
  workDone: number;
  focusHours: number;
  avgScore: number; // 평균 완성도(0~1)
};

export function aggregate(logs: (DailyLog | undefined)[]): Aggregate {
  const present = logs.filter((l): l is DailyLog => Boolean(l));
  const sleepHrs = logs.map(sleepHoursOf).filter((h) => h > 0);
  const scored = present.map((l) => dayScore(l).ratio);
  return {
    activeDays: present.filter(hasAnyEntry).length,
    sleepAvg: round1(avg(sleepHrs)),
    exDays: logs.filter(exerciseDone).length,
    exMinutes: sum(logs.map(exerciseMinutes)),
    studyMin: sum(logs.map(studyTotalOf)),
    studyByCat: {
      english: sum(logs.map((l) => l?.study?.english || 0)),
      business: sum(logs.map((l) => l?.study?.business || 0)),
      ai: sum(logs.map((l) => l?.study?.ai || 0)),
    },
    readMin: sum(logs.map(readingMinutes)),
    readPages: sum(logs.map(readingPages)),
    workDone: sum(logs.map((l) => l?.work?.done || 0)),
    focusHours: round1(sum(logs.map((l) => l?.work?.focusHours || 0))),
    avgScore: scored.length ? avg(scored) : 0,
  };
}
