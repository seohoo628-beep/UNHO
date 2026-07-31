import { parseCsv, toNum } from "@/lib/csv";
import { getSetting } from "@/lib/settings";

// P&L 구글 시트 — 읽기 전용. KPI 카드 블록에서 핵심 지표를 추출한다.
export const DEFAULT_PNL_SHEET_ID = "1qQIV3l2fadd05x2pthY0MbsDpo3Yg0NlYK3AjAdRo3o";
export const DEFAULT_PNL_GID = "18967067";

export async function getPnlSheet(): Promise<{ id: string; gid: string }> {
  return {
    id: (await getSetting("pnl_sheet_id")) || DEFAULT_PNL_SHEET_ID,
    gid: (await getSetting("pnl_gid")) || DEFAULT_PNL_GID,
  };
}

export async function fetchPnlRows(
  sheetId?: string,
  gid?: string
): Promise<{ ok: boolean; rows?: string[][]; error?: string }> {
  const cfg = await getPnlSheet();
  const id = sheetId || cfg.id;
  const g = gid || cfg.gid;
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${g}`;
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store" });
    const text = await res.text();
    if (!res.ok || text.trim().startsWith("<")) {
      return {
        ok: false,
        error: '시트를 읽지 못했습니다. 공유를 "링크가 있는 모든 사용자 · 뷰어"로 설정하세요.',
      };
    }
    return { ok: true, rows: parseCsv(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "시트 읽기 실패" };
  }
}

const clean = (s: string) => s.replace(/\[merged\]/g, "").trim();

export type PnlKpis = {
  revenue: number | null;
  net_revenue: number | null;
  op_profit: number | null;
  margin_pct: number | null;
  ad_cost: number | null;
  roas: number | null;
  refund_pct: number | null;
  orders: number | null;
  aov: number | null;
};

const LABELS: { key: keyof PnlKpis; label: string }[] = [
  { key: "revenue", label: "총 매출" },
  { key: "net_revenue", label: "순 매출" },
  { key: "op_profit", label: "영업 이익" },
  { key: "margin_pct", label: "이익률" },
  { key: "ad_cost", label: "광고비" },
  { key: "roas", label: "ROAS" },
  { key: "refund_pct", label: "환불률" },
  { key: "orders", label: "주문건수" },
  { key: "aov", label: "객단가" },
];

/** KPI 라벨 행을 찾아 바로 아래 값 행에서 지표를 추출한다(병합셀 중복 허용). */
export function extractPnlKpis(rows: string[][]): PnlKpis {
  const empty: PnlKpis = {
    revenue: null, net_revenue: null, op_profit: null, margin_pct: null,
    ad_cost: null, roas: null, refund_pct: null, orders: null, aov: null,
  };

  let labelRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(clean);
    if (cells.includes("총 매출") && cells.includes("영업 이익")) {
      labelRow = i;
      break;
    }
  }
  if (labelRow < 0 || labelRow + 1 >= rows.length) return empty;

  const labels = rows[labelRow].map(clean);
  const values = rows[labelRow + 1];
  const out = { ...empty };
  for (const { key, label } of LABELS) {
    const col = labels.findIndex((c) => c === label);
    if (col >= 0) out[key] = toNum(values[col]);
  }
  return out;
}
