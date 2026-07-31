import { parseCsv } from "@/lib/csv";
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
  // headers=0 → gviz가 첫 행을 헤더로 오해해 격자를 밀어버리는 것을 막는다(병합셀 대시보드 대응).
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=0&gid=${g}`;
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

// 진단용: gviz 원문(직렬화된 CSV) 앞부분을 그대로 가져온다.
export async function fetchPnlRaw(): Promise<{ status: number; len: number; head: string }> {
  const cfg = await getPnlSheet();
  const url = `https://docs.google.com/spreadsheets/d/${cfg.id}/gviz/tq?tqx=out:csv&headers=0&gid=${cfg.gid}`;
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store" });
    const text = await res.text();
    return { status: res.status, len: text.length, head: text.slice(0, 4000) };
  } catch (e) {
    return { status: -1, len: 0, head: e instanceof Error ? e.message : "fetch failed" };
  }
}

const clean = (s: string) => (s ?? "").replace(/\[merged\]/g, "").trim();

// 공백을 모두 제거해 라벨 비교를 안정화한다("총 매출" === "총매출").
const norm = (s: string) => clean(s).replace(/\s+/g, "");

/** 금액·퍼센트·건수 셀을 숫자로. "99.3%"→99.3, "2,001,559,325"→2001559325, "(1,234)"→-1234. */
export function parseKpiNum(v: string | undefined): number | null {
  if (v == null) return null;
  const s = clean(v);
  if (s === "" || s === "-" || s === "#REF!" || s === "#N/A") return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-") || s.startsWith("−");
  const digits = s.replace(/[^0-9.]/g, "");
  if (digits === "" || digits === ".") return null;
  const n = Number(digits);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

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

// 각 KPI 라벨의 후보 표기(공백 제거 후 비교). 시트 표기가 조금 달라도 잡히도록 여러 개 둔다.
const LABELS: { key: keyof PnlKpis; aliases: string[] }[] = [
  { key: "revenue", aliases: ["총매출"] },
  { key: "net_revenue", aliases: ["순매출"] },
  { key: "op_profit", aliases: ["영업이익"] },
  { key: "margin_pct", aliases: ["이익률"] },
  { key: "ad_cost", aliases: ["광고비"] },
  { key: "roas", aliases: ["ROAS", "roas"] },
  { key: "refund_pct", aliases: ["환불률"] },
  { key: "orders", aliases: ["주문건수", "주문수", "주문"] },
  { key: "aov", aliases: ["객단가"] },
];

/**
 * KPI 카드 블록에서 지표를 추출한다. 병합셀(gviz는 앵커 셀에만 값, 나머지는 빈칸)과
 * 라벨/값 행이 1~3행 떨어져 있는 경우, 공백 표기 차이까지 견디도록 유연하게 찾는다.
 */
export function extractPnlKpis(rows: string[][]): PnlKpis {
  const empty: PnlKpis = {
    revenue: null, net_revenue: null, op_profit: null, margin_pct: null,
    ad_cost: null, roas: null, refund_pct: null, orders: null, aov: null,
  };

  const gridNorm = rows.map((r) => r.map(norm));

  // 라벨을 가장 많이 포함하는 행 = 라벨 행.
  const matchesInRow = (r: string[]) =>
    LABELS.filter((L) => r.some((c) => L.aliases.some((a) => norm(a) === c))).length;
  let labelRow = -1;
  let best = 1; // 최소 2개 이상 매칭돼야 라벨 행으로 인정
  for (let i = 0; i < gridNorm.length; i++) {
    const m = matchesInRow(gridNorm[i]);
    if (m > best) {
      best = m;
      labelRow = i;
    }
  }
  if (labelRow < 0) return empty;

  const out = { ...empty };
  for (const { key, aliases } of LABELS) {
    const wanted = aliases.map((a) => norm(a));
    // 라벨의 가장 왼쪽 컬럼.
    const col = gridNorm[labelRow].findIndex((c) => wanted.includes(c));
    if (col < 0) continue;
    // 값은 라벨 행 아래 1~3행, 같은 컬럼 우선 → 없으면 바로 옆 컬럼(병합 오프셋 대비).
    let val: number | null = null;
    for (const c of [col, col + 1]) {
      for (let dr = 1; dr <= 3 && val == null; dr++) {
        const row = rows[labelRow + dr];
        if (!row) break;
        val = parseKpiNum(row[c]);
      }
      if (val != null) break;
    }
    out[key] = val;
  }
  return out;
}

/** 진단용: 읽어온 격자의 앞부분을 간단히 요약한다(대표 화면 debug 표시). */
export function debugPnlGrid(rows: string[][], maxRows = 8, maxCols = 22): string[][] {
  return rows.slice(0, maxRows).map((r) => r.slice(0, maxCols).map(clean));
}
