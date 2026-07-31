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
  // headers=0 → 첫 행 헤더 오인 방지. range → gviz가 빈 행에서 멈추는 것을 막아
  // 표 사이 빈 줄 아래(월간 손익표)까지 모두 읽게 강제한다.
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=0&range=A1:AZ500&gid=${g}`;
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
  const url = `https://docs.google.com/spreadsheets/d/${cfg.id}/gviz/tq?tqx=out:csv&headers=0&range=A1:AZ500&gid=${cfg.gid}`;
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

// ── 월간 손익계산서(P&L) 파싱 ──────────────────────────────────────────────
// 이 탭은 행 기준(왼쪽 col0=항목명, 오른쪽=월별 값, 마지막=연간 합계) 구조다.

export type PnlLineKind = "won" | "pct";

// 화면에 보여줄 손익 라인(시트의 실제 항목명 기준).
export const PNL_LINES: { key: string; label: string; aliases: string[]; kind: PnlLineKind }[] = [
  { key: "revenue", label: "총매출", aliases: ["총매출"], kind: "won" },
  { key: "gross_profit", label: "매출총이익", aliases: ["매출총이익"], kind: "won" },
  { key: "gross_margin", label: "매출총이익률", aliases: ["매출총이익률"], kind: "pct" },
  { key: "ad_cost", label: "광고비", aliases: ["광고비"], kind: "won" },
  { key: "opex", label: "판관비 합", aliases: ["판관비합", "판관비"], kind: "won" },
  { key: "op_profit", label: "영업이익", aliases: ["영업이익"], kind: "won" },
  { key: "op_margin", label: "영업이익률", aliases: ["영업이익률"], kind: "pct" },
];

export type MonthlyPnl = {
  months: string[]; // ["1월",...,"12월","연간"]
  lines: { key: string; label: string; kind: PnlLineKind; values: (number | null)[] }[]; // months 정렬
  latestIdx: number; // 매출이 있는 가장 최근 월(없으면 마지막 월). "연간"은 제외.
};

/** "월간 손익계산서" 표를 찾아 월별 손익 라인을 추출한다. */
export function extractMonthlyPnl(rows: string[][]): MonthlyPnl | null {
  const g = rows.map((r) => r.map(norm));

  // 월별 헤더 행: col0가 '항목'이고 '1월'과('12월' 또는 '연간합계')을 포함.
  let hdr = -1;
  for (let i = 0; i < g.length; i++) {
    const r = g[i];
    if (r.some((c) => c === "항목") && r.includes("1월") && (r.includes("12월") || r.includes("연간합계"))) {
      hdr = i;
      break;
    }
  }
  if (hdr < 0) return null;

  // 월 컬럼(1월~12월) + 연간 합계 컬럼.
  const monthCols: { label: string; idx: number }[] = [];
  g[hdr].forEach((c, idx) => {
    if (/^\d+월$/.test(c)) monthCols.push({ label: c, idx });
  });
  const annualIdx = g[hdr].findIndex((c) => c === "연간합계");
  if (annualIdx >= 0) monthCols.push({ label: "연간", idx: annualIdx });
  if (monthCols.length === 0) return null;

  const lines = PNL_LINES.map((L) => {
    const wanted = L.aliases.map((a) => norm(a));
    let ri = -1;
    for (let i = hdr + 1; i < g.length; i++) {
      if (wanted.includes(g[i][0])) {
        ri = i;
        break;
      }
    }
    const values = monthCols.map((mc) => (ri >= 0 ? parseKpiNum(rows[ri][mc.idx]) : null));
    return { key: L.key, label: L.label, kind: L.kind, values };
  });

  // 매출이 있는 가장 최근 월(연간 제외).
  const rev = lines.find((l) => l.key === "revenue");
  let latestIdx = 0;
  for (let i = 0; i < monthCols.length; i++) {
    if (monthCols[i].label === "연간") continue;
    const v = rev?.values[i];
    if (v != null && v > 0) latestIdx = i;
  }

  return { months: monthCols.map((m) => m.label), lines, latestIdx };
}

/** 특정 월(index)의 값을 KPI 스냅샷 형태로 뽑는다. 없으면 최근 월. */
export function extractPnlKpis(rows: string[][], monthIdx?: number): PnlKpis {
  const empty: PnlKpis = {
    revenue: null, net_revenue: null, op_profit: null, margin_pct: null,
    ad_cost: null, roas: null, refund_pct: null, orders: null, aov: null,
  };
  const m = extractMonthlyPnl(rows);
  if (!m) return empty;
  const i = monthIdx != null && monthIdx >= 0 && monthIdx < m.months.length ? monthIdx : m.latestIdx;
  const at = (key: string) => m.lines.find((l) => l.key === key)?.values[i] ?? null;
  return {
    revenue: at("revenue"),
    net_revenue: at("gross_profit"), // 순매출 자리에 매출총이익(스키마 재사용)
    op_profit: at("op_profit"),
    margin_pct: at("op_margin"),
    ad_cost: at("ad_cost"),
    roas: null,
    refund_pct: at("gross_margin"), // 환불률 자리에 매출총이익률(스키마 재사용)
    orders: null,
    aov: at("opex"), // 객단가 자리에 판관비 합(스키마 재사용)
  };
}

/** 진단용: 읽어온 격자의 앞부분을 간단히 요약한다(대표 화면 debug 표시). */
export function debugPnlGrid(rows: string[][], maxRows = 8, maxCols = 22): string[][] {
  return rows.slice(0, maxRows).map((r) => r.slice(0, maxCols).map(clean));
}
