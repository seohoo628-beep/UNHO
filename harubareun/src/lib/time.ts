// 시간대는 전부 Asia/Seoul로 고정한다.

export const SEOUL_TZ = "Asia/Seoul";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: SEOUL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: SEOUL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO 문자열 → Seoul 기준 YYYY-MM-DD */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  // ko-KR 은 "2026. 07. 30." 형태 → 정규화
  return dateFmt.format(d).replace(/\.\s?/g, "-").replace(/-$/, "");
}

/** ISO 문자열 → Seoul 기준 YYYY-MM-DD HH:mm */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return dateTimeFmt.format(d);
}

/** Seoul 기준 오늘 날짜 (YYYY-MM-DD) */
export function seoulToday(): string {
  return fmtDate(new Date().toISOString());
}

/** due_date 가 오늘보다 과거이고 미완료면 지연 */
export function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate) return false;
  if (status === "완료" || status === "취소") return false;
  return dueDate < seoulToday();
}
