export function won(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

export function manwon(n: number): string {
  // 만원 단위 축약 (대시보드 카드용)
  if (Math.abs(n) >= 100_000_000) return (n / 100_000_000).toFixed(1) + "억";
  if (Math.abs(n) >= 10_000) return Math.round(n / 10_000).toLocaleString("ko-KR") + "만";
  return n.toLocaleString("ko-KR");
}

export function pct(n: number, digits = 1): string {
  return n.toFixed(digits) + "%";
}

export function num(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function ratio(part: number, whole: number): number {
  if (!whole) return 0;
  return (part / whole) * 100;
}

export function uid(prefix = "x"): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const WD = ["일", "월", "화", "수", "목", "금", "토"];

// YYYY-MM-DD → 요일 인덱스(0=일). UTC 기준으로 계산해 TZ 영향 제거.
export function weekdayIdx(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function weekdayKo(dateStr: string): string {
  return WD[weekdayIdx(dateStr)];
}
export function isWeekend(dateStr: string): boolean {
  const w = weekdayIdx(dateStr);
  return w === 0 || w === 6;
}

// 날짜 문자열에 일수 더하기
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// 해당 날짜가 속한 주(월요일 시작) 7일 배열
export function weekOf(dateStr: string): string[] {
  const w = weekdayIdx(dateStr);
  const offsetToMon = (w + 6) % 7; // 월=0
  const mon = addDays(dateStr, -offsetToMon);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

// "HH:mm" 시각을 분으로. "24:00" 지원.
export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
// 근무 시간(시간 단위, 소수 허용)
export function shiftHours(start: string, end: string): number {
  return Math.max(0, (toMin(end) - toMin(start)) / 60);
}
export function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}
