// 무당티 유통 관리 — 계산 규칙(순수 함수). 화면·테스트 공용.
// 매출 = 수량 × 판매가(VAT 별도) / 원가 = 수량 × 공급가(VAT 포함 ÷ (1+부가세율))
// 판매 배송비 = 올림(수량 ÷ 1건당 박스 수) × 건당 배송비 / 이익 = 매출 − 원가 − 배송비

export const MDT_STAGES = ["발굴", "제안", "샘플", "협상", "입점", "판매중", "보류", "종료"] as const;
export const MDT_OPEN_STAGES = ["발굴", "제안", "샘플", "협상"];
export const MDT_LIVE_STAGES = ["입점", "판매중"];
export const MDT_CHANNELS = ["공구", "편의점", "올리브영", "약국", "면세점", "백화점·몰", "라이브커머스", "프랜차이즈", "태국 수출", "몽골 수출", "중국(왕홍)", "온라인", "기타"];
export const MDT_SHIP_KINDS = ["샘플", "반품", "재발송", "기타"] as const;

export interface MdtSettings {
  supplyPriceIncl: number | null;
  vatRate: number;
  retailPrice: number | null;
  shipPerCarton: number | null;
  boxesPerCarton: number | null;
}
export interface MdtAccount {
  id: string; name: string; channel: string; stage: string; dealType: string; salePrice: number | null;
  contact: string; nextAction: string; nextDate: string; note: string;
}
export interface MdtLot { id: string; lotNo: string; receivedDate: string; expiry: string; qtyIn: number; note: string }
export interface MdtSale {
  id: string; saleDate: string; accountId: string; lotId: string; qty: number; unitPrice: number; shipCost: number | null; note: string;
}
export interface MdtShipment { id: string; shipDate: string; kind: string; accountId: string; cost: number; note: string }

/** 원가 계산용 공급가(박스당, VAT 별도). 설정이 없으면 null. */
export function supplyExVat(s: MdtSettings | null): number | null {
  if (!s || s.supplyPriceIncl == null) return null;
  return s.supplyPriceIncl / (1 + (s.vatRate || 0));
}

/** 판매 1건의 기본 배송비: 올림(수량 ÷ 1건당 박스 수) × 건당 배송비. */
export function autoShipCost(qty: number, s: MdtSettings | null): number | null {
  if (!s || !s.shipPerCarton || !s.boxesPerCarton || !(qty > 0)) return null;
  return Math.ceil(qty / s.boxesPerCarton) * s.shipPerCarton;
}
export function cartons(qty: number, s: MdtSettings | null): number | null {
  if (!s || !s.boxesPerCarton || !(qty > 0)) return null;
  return Math.ceil(qty / s.boxesPerCarton);
}

export function saleCalc(sale: Pick<MdtSale, "qty" | "unitPrice" | "shipCost">, s: MdtSettings | null) {
  const revenue = (sale.qty || 0) * (sale.unitPrice || 0);
  const unitCost = supplyExVat(s) ?? 0;
  const cost = Math.round((sale.qty || 0) * unitCost); // 판매 1건 단위로 원 미만 반올림
  const ship = sale.shipCost || 0;
  return { revenue, cost, ship, profit: revenue - cost - ship };
}

export function totals(sales: MdtSale[], s: MdtSettings | null) {
  let revenue = 0, cost = 0, ship = 0, boxes = 0;
  for (const x of sales) {
    const c = saleCalc(x, s);
    revenue += c.revenue; cost += c.cost; ship += c.ship; boxes += x.qty || 0;
  }
  return { revenue, cost, ship, boxes, profit: revenue - cost - ship };
}

export function lotSold(lot: MdtLot, sales: MdtSale[]) {
  return sales.filter((x) => x.lotId === lot.id).reduce((a, x) => a + (x.qty || 0), 0);
}
export function lotStock(lot: MdtLot, sales: MdtSale[]) {
  return (lot.qtyIn || 0) - lotSold(lot, sales);
}

/** 오늘(YYYY-MM-DD)부터 날짜까지 남은 일수. 날짜가 없으면 null. */
export function daysUntil(date: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  return Math.round((Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86400000);
}

export type ExpiryLevel = "none" | "past" | "urgent" | "watch" | "ok";
/** 유통기한 등급: 지남 / 90일 이내 임박 / 180일 이내 주의 / 정상. */
export function expiryLevel(d: number | null): ExpiryLevel {
  if (d === null) return "none";
  if (d < 0) return "past";
  if (d <= 90) return "urgent";
  if (d <= 180) return "watch";
  return "ok";
}

/** 최근 n개월 키(YYYY-MM), 오래된 달부터. */
export function lastMonths(today: string, n: number): string[] {
  const y = +today.slice(0, 4), m = +today.slice(5, 7) - 1;
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
