import type { DailySales, MenuItem, StoreId } from "./types";
import { weekdayIdx } from "./format";

export interface SalesTotals {
  revenue: number;
  lunch: number;
  dinner: number;
  covers: number;
  purchase: number; // 식자재 매입
  misc: number; // 기타 경비
  expense: number; // 총 지출
  net: number; // 순이익(매출-지출)
  netRate: number; // 순이익률 %
  days: number;
  dailyAvg: number;
  avgCheck: number; // 객단가
}

// 일 매출: 신규(카드/현금/현금영수증) + 구(런치/디너). 둘은 상호배타적이라 합산 안전.
export function dayRevenue(r: DailySales): number {
  return (r.card ?? 0) + (r.cash ?? 0) + (r.cashReceipt ?? 0) + (r.lunch ?? 0) + (r.dinner ?? 0);
}
// 일 체험단 제공금액(지출로 반영)
export function dayTasterCost(r: DailySales): number {
  return r.tasterCost ?? 0;
}

export function totals(rows: DailySales[]): SalesTotals {
  const revenue = rows.reduce((s, r) => s + dayRevenue(r), 0);
  const lunch = rows.reduce((s, r) => s + (r.lunch ?? 0), 0);
  const dinner = rows.reduce((s, r) => s + (r.dinner ?? 0), 0);
  const covers = rows.reduce((s, r) => s + r.covers, 0);
  const purchase = rows.reduce((s, r) => s + (r.purchase ?? 0) + (r.expenses?.reduce((a, e) => a + e.amount, 0) ?? 0), 0);
  const misc = rows.reduce((s, r) => s + (r.misc ?? 0) + dayTasterCost(r), 0);
  const expense = purchase + misc;
  const net = revenue - expense;
  const days = rows.length;
  return {
    revenue,
    lunch,
    dinner,
    covers,
    purchase,
    misc,
    expense,
    net,
    netRate: revenue ? (net / revenue) * 100 : 0,
    days,
    dailyAvg: days ? revenue / days : 0,
    avgCheck: covers ? revenue / covers : 0,
  };
}

// 일일 손익 헬퍼 — 항목별 지출 + 체험단 제공금액 + 구 필드 합산
export function dayExpense(r: DailySales): number {
  const items = r.expenses?.reduce((a, e) => a + e.amount, 0) ?? 0;
  return items + (r.purchase ?? 0) + (r.misc ?? 0) + dayTasterCost(r);
}
export function dayNet(r: DailySales): number {
  return dayRevenue(r) - dayExpense(r);
}

// 요일별 평균 매출 (0=일 … 6=토)
export function byWeekday(rows: DailySales[]): { wd: number; avg: number; count: number }[] {
  const buckets: { sum: number; count: number }[] = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  for (const r of rows) {
    const w = weekdayIdx(r.date);
    buckets[w].sum += dayRevenue(r);
    buckets[w].count += 1;
  }
  return buckets.map((b, wd) => ({ wd, avg: b.count ? b.sum / b.count : 0, count: b.count }));
}

// 매장별 시간대 가중치(런치/디너 피크 반영). 시간→비중.
const HOUR_SHAPE: Record<StoreId, { lunch: [number, number][]; dinner: [number, number][] }> = {
  // 신미집: 백반·찌개 → 점심 강세
  smjp: {
    lunch: [[11, 0.22], [12, 0.42], [13, 0.24], [14, 0.12]],
    dinner: [[17, 0.2], [18, 0.3], [19, 0.28], [20, 0.22]],
  },
  // 대운목장: 한우 구이 → 저녁 강세(점심 소폭)
  dwmc: {
    lunch: [[12, 0.5], [13, 0.5]],
    dinner: [[17, 0.12], [18, 0.2], [19, 0.24], [20, 0.22], [21, 0.22]],
  },
};

export interface HeatCell {
  wd: number;
  hour: number;
  value: number;
}

// 요일 × 시간대 매출 분포(추정): 요일별 평균 런치/디너를 시간 가중치로 배분
export function hourHeat(rows: DailySales[], store: StoreId): { hours: number[]; cells: HeatCell[]; max: number } {
  const shape = HOUR_SHAPE[store];
  const hours = Array.from(new Set([...shape.lunch, ...shape.dinner].map(([h]) => h))).sort((a, b) => a - b);
  // 요일별 평균 런치/디너
  const wdBuckets = Array.from({ length: 7 }, () => ({ lunch: 0, dinner: 0, count: 0 }));
  for (const r of rows) {
    const w = weekdayIdx(r.date);
    wdBuckets[w].lunch += r.lunch;
    wdBuckets[w].dinner += r.dinner;
    wdBuckets[w].count += 1;
  }
  const cells: HeatCell[] = [];
  let max = 0;
  for (let wd = 0; wd < 7; wd++) {
    const b = wdBuckets[wd];
    if (!b.count) {
      for (const h of hours) cells.push({ wd, hour: h, value: 0 });
      continue;
    }
    const avgL = b.lunch / b.count;
    const avgD = b.dinner / b.count;
    const hourVal: Record<number, number> = {};
    for (const [h, w] of shape.lunch) hourVal[h] = (hourVal[h] ?? 0) + avgL * w;
    for (const [h, w] of shape.dinner) hourVal[h] = (hourVal[h] ?? 0) + avgD * w;
    for (const h of hours) {
      const v = hourVal[h] ?? 0;
      max = Math.max(max, v);
      cells.push({ wd, hour: h, value: v });
    }
  }
  return { hours, cells, max };
}

export interface MenuDerived extends MenuItem {
  sales: number; // 매출 = price * soldQty
  margin: number; // 마진 = (price-cost) * soldQty
  costRate: number; // 원가율 %
}

export function deriveMenus(items: MenuItem[]): MenuDerived[] {
  return items
    .map((m) => ({
      ...m,
      sales: m.price * m.soldQty,
      margin: (m.price - m.cost) * m.soldQty,
      costRate: m.price ? (m.cost / m.price) * 100 : 0,
    }))
    .sort((a, b) => b.sales - a.sales);
}
