import { parseCsv } from "@/lib/csv";
import { getSetting } from "@/lib/settings";

// P&L 구글 시트 — 읽기 전용. KPI 카드 블록에서 핵심 지표를 추출한다.
export const DEFAULT_PNL_SHEET_ID = ""; // 운호 시트 제거. /settings 에서 설정한다.
// "월간 손익계산서 (P&L)" 탭. 설정에서 pnl_gid로 덮어쓸 수 있다.
export const DEFAULT_PNL_GID = "1755543020";

export async function getPnlSheet(): Promise<{ id: string; gid: string }> {
  return {
    id: (await getSetting("pnl_sheet_id")) || DEFAULT_PNL_SHEET_ID,
    gid: (await getSetting("pnl_gid")) || DEFAULT_PNL_GID,
  };
}

function exportUrl(id: string, g: string) {
  // 시트 전체를 CSV로. gviz와 달리 빈 행에서 멈추지 않아 월간 손익표까지 모두 온다.
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${g}`;
}
function gvizUrl(id: string, g: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=0&range=A1:AZ500&gid=${g}`;
}

async function fetchCsv(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  const text = await res.text();
  const ok = res.ok && !text.trim().startsWith("<");
  return { ok, status: res.status, text };
}

export async function fetchPnlRows(
  sheetId?: string,
  gid?: string
): Promise<{ ok: boolean; rows?: string[][]; error?: string }> {
  const cfg = await getPnlSheet();
  const id = sheetId || cfg.id;
  const g = gid || cfg.gid;
  try {
    // export·gviz 둘 다 시도해 '더 많은 행'을 반환한 쪽을 쓴다(둘 다 빈 행에서 잘릴 수 있음).
    const [ex, gz] = await Promise.all([
      fetchCsv(exportUrl(id, g)).catch(() => ({ ok: false, status: -1, text: "" })),
      fetchCsv(gvizUrl(id, g)).catch(() => ({ ok: false, status: -1, text: "" })),
    ]);
    const cands = [ex, gz].filter((r) => r.ok).map((r) => parseCsv(r.text));
    if (cands.length === 0) {
      return {
        ok: false,
        error: '시트를 읽지 못했습니다. 공유를 "링크가 있는 모든 사용자 · 뷰어"로 설정하세요.',
      };
    }
    const rows = cands.sort((a, b) => b.length - a.length)[0];
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "시트 읽기 실패" };
  }
}

// 진단용: export·gviz 두 경로의 상태·길이·원문 앞부분을 함께 보여준다.
export async function fetchPnlRaw(): Promise<{
  status: number;
  len: number;
  head: string;
  via: string;
  exportLen: number;
  gvizLen: number;
}> {
  const cfg = await getPnlSheet();
  let ex = { ok: false, status: 0, text: "" };
  let gz = { ok: false, status: 0, text: "" };
  try {
    ex = await fetchCsv(exportUrl(cfg.id, cfg.gid));
  } catch (e) {
    ex = { ok: false, status: -1, text: e instanceof Error ? e.message : "err" };
  }
  try {
    gz = await fetchCsv(gvizUrl(cfg.id, cfg.gid));
  } catch (e) {
    gz = { ok: false, status: -1, text: e instanceof Error ? e.message : "err" };
  }
  const chosen = ex.ok ? ex : gz;
  return {
    status: chosen.status,
    len: chosen.text.length,
    head: chosen.text.slice(0, 4000),
    via: ex.ok ? "export" : gz.ok ? "gviz" : "none",
    exportLen: ex.text.length,
    gvizLen: gz.text.length,
  };
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
  periods: string[]; // 기간 라벨 예: ["1월"..,"연간"] 또는 ["1주차"..,"합계"]
  periodKind: "월" | "주차";
  lines: { key: string; label: string; kind: PnlLineKind; values: (number | null)[] }[];
  latestIdx: number; // 매출이 있는 가장 최근 기간(합계/연간 제외).
};

/** 손익표(월간 또는 주간)를 찾아 기간별 손익 라인을 추출한다. */
export function extractMonthlyPnl(rows: string[][]): MonthlyPnl | null {
  const g = rows.map((r) => r.map(norm));
  const isPeriod = (c: string) => /^\d+월$/.test(c) || /^\d+주차$/.test(c);

  // 헤더 행: col0에 '항목'이 있고 기간 셀(N월/N주차)이 3개 이상.
  let hdr = -1;
  for (let i = 0; i < g.length; i++) {
    const r = g[i];
    if (r.some((c) => c === "항목") && r.filter(isPeriod).length >= 3) {
      hdr = i;
      break;
    }
  }
  if (hdr < 0) return null;

  const periodKind: "월" | "주차" = g[hdr].some((c) => /^\d+월$/.test(c)) ? "월" : "주차";

  const cols: { label: string; idx: number }[] = [];
  g[hdr].forEach((c, idx) => {
    if (isPeriod(c)) cols.push({ label: rows[hdr][idx].trim(), idx });
  });
  // 합계/연간 합계 컬럼.
  const totalIdx = g[hdr].findIndex((c) => c === "연간합계" || c === "합계");
  if (totalIdx >= 0) cols.push({ label: periodKind === "월" ? "연간" : "합계", idx: totalIdx });
  if (cols.length === 0) return null;

  const lines = PNL_LINES.map((L) => {
    const wanted = L.aliases.map((a) => norm(a));
    let ri = -1;
    for (let i = hdr + 1; i < g.length; i++) {
      if (wanted.includes(g[i][0])) {
        ri = i;
        break;
      }
    }
    const values = cols.map((mc) => (ri >= 0 ? parseKpiNum(rows[ri][mc.idx]) : null));
    return { key: L.key, label: L.label, kind: L.kind, values };
  });

  // 매출이 있는 가장 최근 기간(합계/연간 제외).
  const rev = lines.find((l) => l.key === "revenue");
  let latestIdx = 0;
  for (let i = 0; i < cols.length; i++) {
    if (cols[i].label === "연간" || cols[i].label === "합계") continue;
    const v = rev?.values[i];
    if (v != null && v > 0) latestIdx = i;
  }

  return { periods: cols.map((m) => m.label), periodKind, lines, latestIdx };
}

/** 특정 기간(index)의 값을 KPI 스냅샷 형태로 뽑는다. 없으면 최근 기간. */
export function extractPnlKpis(rows: string[][], monthIdx?: number): PnlKpis {
  const empty: PnlKpis = {
    revenue: null, net_revenue: null, op_profit: null, margin_pct: null,
    ad_cost: null, roas: null, refund_pct: null, orders: null, aov: null,
  };
  const m = extractMonthlyPnl(rows);
  if (!m) return empty;
  const i = monthIdx != null && monthIdx >= 0 && monthIdx < m.periods.length ? monthIdx : m.latestIdx;
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
