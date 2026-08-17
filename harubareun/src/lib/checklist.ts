// 오늘의 체크리스트 공용 로직·타입(서버/클라이언트 공용, 순수 함수만).

export type Recurrence = "daily" | "weekly" | "monthly";

export type ChecklistItem = {
  id: string;
  group: string;
  label: string;
  href: string | null;
  role: string | null; // null=전원
  recurrence: Recurrence;
  weekday: number | null; // 0=일..6=토
  monthDay: number | null; // 1..31
  sortOrder: number;
  active: boolean;
};

// 오늘 화면에 뜨는 항목(개인 완료 여부 + 팀 완료 인원 포함).
export type DueItem = ChecklistItem & { done: boolean; teamDone: number };

export const ROLE_OPTIONS: { code: string; label: string }[] = [
  { code: "", label: "전원" },
  { code: "manager", label: "경영지원" },
  { code: "designer", label: "디자이너" },
  { code: "marketer", label: "마케터" },
  { code: "bm", label: "BM" },
  { code: "md", label: "MD" },
  { code: "owner", label: "대표" },
];

export const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.filter((r) => r.code).map((r) => [r.code, r.label])
);

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
};

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 'YYYY-MM-DD'(KST 달력일)의 요일(0=일..6=토). UTC 자정으로 파싱해 요일만 취함.
export function weekdayOf(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay();
}
export function monthDayOf(dateStr: string): number {
  return Number(dateStr.slice(8, 10)) || 1;
}

// 해당 날짜에 이 항목이 떠야 하는가?
export function isDueOn(item: { recurrence: Recurrence; weekday: number | null; monthDay: number | null }, dateStr: string): boolean {
  if (item.recurrence === "daily") return true;
  if (item.recurrence === "weekly") return item.weekday != null && item.weekday === weekdayOf(dateStr);
  if (item.recurrence === "monthly") return item.monthDay != null && item.monthDay === monthDayOf(dateStr);
  return true;
}

// 사용자의 직무 역할 코드 추정. owner 권한은 전 항목을 보도록 'owner' 반환(전체 노출).
export function detectRole(jobTitle: string | null | undefined, appRole: string): string | null {
  if (appRole === "owner") return "owner";
  const t = (jobTitle || "").toLowerCase();
  if (/대표|ceo|owner/.test(t)) return "owner";
  if (/경영지원|경영|매니저|manager|재무|회계|경리|물류|cs/.test(t)) return "manager";
  if (/디자|designer/.test(t)) return "designer";
  if (/마케|marketer|퍼포먼스|광고/.test(t)) return "marketer";
  if (/\bbm\b|브랜드\s?매니|brand/.test(t)) return "bm";
  if (/\bmd\b|엠디|상품기획|소싱/.test(t)) return "md";
  return null;
}

// 역할 필터에 따라 항목이 보이는가. viewRole='' → 전체(전원+모든 역할). 그 외 → 전원 + 해당 역할.
export function itemVisibleFor(item: { role: string | null }, viewRole: string): boolean {
  if (!viewRole || viewRole === "owner") return true; // 전체 보기 / 대표
  return item.role == null || item.role === viewRole;
}

// N일 전 날짜 문자열(dateStr 기준, KST 달력일 단위).
export function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
