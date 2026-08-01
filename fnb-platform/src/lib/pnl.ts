import type { PnlMonth } from "./types";

export interface PnlDerived extends PnlMonth {
  cogs: number; // 식자재 원가 (=foodCost, 별칭)
  totalCost: number;
  operatingProfit: number; // 영업이익
  opMargin: number; // 영업이익률 %
  foodCostRate: number; // 원가율 %
  laborRate: number; // 인건비율 %
}

export function derivePnl(p: PnlMonth): PnlDerived {
  const totalCost = p.foodCost + p.labor + p.rent + p.utilities + p.marketing + p.other;
  const operatingProfit = p.revenue - totalCost;
  const safe = (n: number) => (p.revenue ? (n / p.revenue) * 100 : 0);
  return {
    ...p,
    cogs: p.foodCost,
    totalCost,
    operatingProfit,
    opMargin: safe(operatingProfit),
    foodCostRate: safe(p.foodCost),
    laborRate: safe(p.labor),
  };
}

export function sumPnl(months: PnlMonth[]): PnlDerived {
  const base: PnlMonth = {
    id: "sum",
    storeId: "chdo",
    month: "합계",
    revenue: 0,
    foodCost: 0,
    labor: 0,
    rent: 0,
    utilities: 0,
    marketing: 0,
    other: 0,
  };
  for (const m of months) {
    base.revenue += m.revenue;
    base.foodCost += m.foodCost;
    base.labor += m.labor;
    base.rent += m.rent;
    base.utilities += m.utilities;
    base.marketing += m.marketing;
    base.other += m.other;
  }
  return derivePnl(base);
}

export const PNL_ROWS: { key: keyof PnlMonth; label: string; kind: "rev" | "cost" }[] = [
  { key: "revenue", label: "매출", kind: "rev" },
  { key: "foodCost", label: "식자재 원가", kind: "cost" },
  { key: "labor", label: "인건비", kind: "cost" },
  { key: "rent", label: "임대료", kind: "cost" },
  { key: "utilities", label: "관리·공과금", kind: "cost" },
  { key: "marketing", label: "마케팅비", kind: "cost" },
  { key: "other", label: "기타", kind: "cost" },
];
