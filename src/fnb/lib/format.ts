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
