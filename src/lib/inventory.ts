import type { InventoryItem } from "@/lib/types";
import { seoulToday } from "@/lib/time";

export type StockVerdict = {
  dailyOut: number | null;
  daysToEmpty: number | null;
  reorderDate: string | null; // YYYY-MM-DD
  verdict: "여유" | "발주 임박" | "발주 필요" | "데이터 부족";
};

/**
 * 재고 소진 판정.
 *   일평균 출고 = 최근 30일 출고 / 30
 *   소진일수 = 현재고 / 일평균 출고
 *   발주 필요 임계 = 리드타임 + 안전여유
 *   발주 필요일 = 오늘 + (소진일수 - 리드타임 - 안전여유)
 */
export function stockVerdict(i: InventoryItem): StockVerdict {
  const out = i.out_30d ?? 0;
  const stock = i.current_stock ?? 0;
  const lead = i.lead_time_days ?? 0;
  const safety = i.safety_days ?? 0;

  if (!i.out_30d || out <= 0 || i.current_stock == null) {
    return { dailyOut: null, daysToEmpty: null, reorderDate: null, verdict: "데이터 부족" };
  }

  const dailyOut = out / 30;
  const daysToEmpty = stock / dailyOut;
  const threshold = lead + safety;

  const daysUntilReorder = Math.round(daysToEmpty - threshold);
  const today = new Date(seoulToday() + "T00:00:00+09:00");
  const reorder = new Date(today.getTime() + daysUntilReorder * 86400000);
  const reorderDate = reorder.toISOString().slice(0, 10);

  let verdict: StockVerdict["verdict"];
  if (daysToEmpty <= threshold) verdict = "발주 필요";
  else if (daysToEmpty <= threshold + 7) verdict = "발주 임박";
  else verdict = "여유";

  return {
    dailyOut: Math.round(dailyOut * 10) / 10,
    daysToEmpty: Math.round(daysToEmpty),
    reorderDate,
    verdict,
  };
}
