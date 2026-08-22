// 돈 계산 순수 함수 모음 — 화면과 분리해 테스트 가능하게 유지한다.

// 미수금 잔액: 청구(billed) - 수금(received)의 양수 합.
export function outstandingReceivable(rows: { billed: number | null; received: number | null }[]): number {
  return rows.reduce((s, r) => s + Math.max(0, (Number(r.billed) || 0) - (Number(r.received) || 0)), 0);
}

// 미지급 잔액: 금액(amount) - 지급(paid)의 양수 합.
export function outstandingPayable(rows: { amount: number | null; paid: number | null }[]): number {
  return rows.reduce((s, r) => s + Math.max(0, (Number(r.amount) || 0) - (Number(r.paid) || 0)), 0);
}

// 경영지원 인센티브: (공구 매출 + 프로모션 매출) × 기준%.
export function incentivePay(gongguSales: number, promoSales: number, ratePct: number): { total: number; pay: number } {
  const total = (Number(gongguSales) || 0) + (Number(promoSales) || 0);
  const pay = Math.round((total * (Number(ratePct) || 0)) / 100);
  return { total, pay };
}
