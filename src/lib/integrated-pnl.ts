// 통합 P&L 엔진 — 운호컴퍼니(주당의비결·뷰티밤·파트너사) + 대운목장 + 신미집.
//
// 원천은 구글 시트 "UC_운영도구_P&L"의 매출원장·매입원장·계정매핑 세 탭이다.
// 시트의 파생 탭(월간P&L·주간P&L·연간P&L·대시보드)은 가져오지 않는다. 원장에서
// 시트와 같은 규칙으로 다시 계산하므로, 브랜드·채널·기간을 어떻게 잘라도 같은 손익이 나온다.
//
// 시트가 쓰는 규칙 그대로:
//   매출     = 매출원장 순매출(N열) 중 손익반영=1 행만. 정산입금·재무입금·매입 오기재는 제외.
//   매출원가 = 매입원장 구분(자동)="매출원가" 행을 계정과목별로 집계
//   판관비   = 매입원장 구분(자동)="판관비" + 매출원장 수수료(P열, 손익반영 행만)
//   영업외   = 매입원장 구분(자동)="영업외비용"
//   재무거래·내부거래·카드대금·환불·미분류는 손익에서 빼고 검증 블록에 따로 표시
//
// tests/integrated-pnl.test.ts 가 시트의 월간·주간·연간 P&L 값과 대조한다.

import raw from "@/data/pnl-ledger.json";

// ── 원장 행 ────────────────────────────────────────────────────────────────

export type SaleRow = {
  date: string; // YYYY-MM-DD
  channel: string;
  brand: string;
  sku: string;
  product: string;
  qty: number;
  revenue: number; // 매출(K열)
  adCost: number; // 광고비(L열)
  refund: number; // 환불액(M열)
  netRevenue: number; // 순매출(N열) — P&L 매출 기준
  cost: number; // 제품원가(O열)
  fee: number; // 수수료(P열) — 결제·판매수수료로 판관비에 들어간다
  contribution: number; // 기여이익(Q열)
  txType: string; // 적용 거래유형
  inPnl: boolean; // 손익반영
  note: string;
  week: number; // 시트 주차(D열). 0이면 시트에서 비어 있던 행
};

export type BuyRow = {
  date: string;
  brand: string;
  category: string; // 원장 카테고리(E열)
  vendor: string;
  item: string;
  amount: number;
  payMethod: string;
  acct: string; // 계정과목(자동, M열). 시트에서 비어 있는 행이 21건 있다
  gubun: string; // 구분(자동, N열)
  mappedAcct: string; // 계정매핑표를 카테고리에 적용한 값
  mappedGubun: string;
  note: string;
  week: number; // 시트 주차(K열)
};

export type AccountMap = { category: string; account: string; gubun: string };
export type StoreCostRate = { brand: string; purchase: number; netRevenue: number; rate: number };

type RawShape = {
  source: { title: string; sheetId: string; capturedAt: string };
  mapping: [string, string, string][];
  definitions: string[];
  storeCostRates: [string, number, number, number][];
  sales: (string | number)[][];
  buys: (string | number)[][];
};

const DATA = raw as unknown as RawShape;

const S = (v: string | number | undefined) => (v == null ? "" : String(v));
const N = (v: string | number | undefined) => (typeof v === "number" ? v : Number(v) || 0);

/** 시트 캡처 정보(원본 시트 ID·캡처일). */
export const SOURCE = DATA.source;

export const SALES: SaleRow[] = DATA.sales.map((r) => ({
  date: S(r[0]),
  channel: S(r[1]),
  brand: S(r[2]),
  sku: S(r[3]),
  product: S(r[4]),
  qty: N(r[5]),
  revenue: N(r[6]),
  adCost: N(r[7]),
  refund: N(r[8]),
  netRevenue: N(r[9]),
  cost: N(r[10]),
  fee: N(r[11]),
  contribution: N(r[12]),
  txType: S(r[13]),
  inPnl: N(r[14]) === 1,
  note: S(r[15]),
  week: N(r[16]),
}));

export const BUYS: BuyRow[] = DATA.buys.map((r) => ({
  date: S(r[0]),
  brand: S(r[1]),
  category: S(r[2]),
  vendor: S(r[3]),
  item: S(r[4]),
  amount: N(r[5]),
  payMethod: S(r[6]),
  acct: S(r[7]),
  gubun: S(r[8]),
  mappedAcct: S(r[9]),
  mappedGubun: S(r[10]),
  note: S(r[11]),
  week: N(r[12]),
}));

export const ACCOUNT_MAP: AccountMap[] = DATA.mapping.map(([category, account, gubun]) => ({
  category,
  account,
  gubun,
}));

export const GUBUN_DEFINITIONS: string[] = DATA.definitions;

export const STORE_COST_RATES: StoreCostRate[] = DATA.storeCostRates.map(
  ([brand, purchase, netRevenue, rate]) => ({ brand, purchase, netRevenue, rate })
);

// ── 손익 구조(시트 P&L 탭의 행 구성 그대로) ────────────────────────────────

export const BRANDS = ["주당의비결", "뷰티밤", "파트너사", "대운목장", "신미집"] as const;
export type Brand = (typeof BRANDS)[number];
/** 원장에 브랜드가 비어 있는 행. 매출은 "브랜드 미지정", 매입은 "공통·미지정"으로 부른다. */
export const UNASSIGNED = "브랜드 미지정";
export const UNASSIGNED_BUY = "공통·미지정";
export const BRAND_ROWS: string[] = [...BRANDS, UNASSIGNED];

export const COGS_ACCOUNTS = ["상품매입", "식자재·주류", "원부자재", "포장재", "물류비"];
export const SGA_ACCOUNTS = [
  "광고선전비",
  "인건비",
  "임차료·관리비",
  "지급수수료(외주)",
  "세금과공과",
  "차량유지비",
  "소모품비",
  "기타 운영비",
];
export const FEE_LABEL = "결제·판매수수료 (매출원장)";

/** 대시보드 채널 순서(시트 ③ 채널별 매출과 같은 순서). */
export const CHANNELS = [
  "스마트스토어",
  "카페24",
  "쿠팡",
  "로켓그로스",
  "공동구매",
  "B2B",
  "카카오선물하기",
  "핵이득마켓",
  "그외 오픈마켓",
  "매장",
  "기타",
];

/**
 * 계정 판정 기준.
 *  - "sheet": 매입원장 자동열(M·N)을 그대로 쓴다. 시트의 P&L 탭 값과 정확히 일치한다.
 *             자동열이 비어 있는 21건은 어느 손익 라인에도 잡히지 않는다(시트와 동일).
 *  - "rule":  자동열이 비었으면 계정매핑표를 카테고리에 적용해 채운다. 시트의 누락을 메운 값.
 */
export type CalcMode = "sheet" | "rule";

const acctOf = (b: BuyRow, mode: CalcMode) => (mode === "rule" && !b.acct ? b.mappedAcct : b.acct);
const gubunOf = (b: BuyRow, mode: CalcMode) => (mode === "rule" && !b.gubun ? b.mappedGubun : b.gubun);

// ── 기간 ───────────────────────────────────────────────────────────────────

export type PeriodKind = "month" | "week" | "year";
export type Period = { key: string; label: string; year: number; month?: number; week?: number };

const yearOf = (d: string) => Number(d.slice(0, 4));
const monthOf = (d: string) => Number(d.slice(5, 7));

/** ISO 주차(WEEKNUM(날짜,21)). 시트 주차열이 비어 있는 행을 rule 모드에서 채울 때 쓴다. */
export function isoWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
}

const weekOf = (row: { date: string; week: number }, mode: CalcMode) =>
  mode === "rule" && !row.week ? isoWeek(row.date) : row.week;

export function monthPeriods(year: number): Period[] {
  return Array.from({ length: 12 }, (_, i) => ({
    key: `${year}-${i + 1}`,
    label: `${i + 1}월`,
    year,
    month: i + 1,
  }));
}

/** 분기(1~4)의 13주. 시트 주간P&L과 같은 구간이다. */
export function weekPeriods(year: number, quarter: number): Period[] {
  const start = (quarter - 1) * 13 + 1;
  return Array.from({ length: 13 }, (_, i) => ({
    key: `${year}-W${start + i}`,
    label: `${start + i}주차`,
    year,
    week: start + i,
  }));
}

export function yearPeriods(startYear: number, count = 5): Period[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `${startYear + i}`,
    label: `${startYear + i}`,
    year: startYear + i,
  }));
}

function inPeriod(row: { date: string; week: number }, p: Period, mode: CalcMode): boolean {
  if (yearOf(row.date) !== p.year) return false;
  if (p.month != null) return monthOf(row.date) === p.month;
  if (p.week != null) return weekOf(row, mode) === p.week;
  return true;
}

// ── 브랜드 필터 ────────────────────────────────────────────────────────────

/** 브랜드 선택값. "" 이면 전사 통합. */
export type BrandFilter = string;

const saleBrand = (s: SaleRow) => (BRANDS.includes(s.brand as Brand) ? s.brand : UNASSIGNED);
const buyBrand = (b: BuyRow) => (BRANDS.includes(b.brand as Brand) ? b.brand : UNASSIGNED_BUY);

function matchBrand(rowBrand: string, filter: BrandFilter, unassignedLabel: string): boolean {
  if (!filter) return true;
  if (filter === UNASSIGNED || filter === UNASSIGNED_BUY) return rowBrand === unassignedLabel;
  return rowBrand === filter;
}

// ── 손익 계산 ──────────────────────────────────────────────────────────────

export type PnlColumn = {
  label: string;
  key: string;
  /** 브랜드별 매출(순매출·손익반영 행만). 브랜드 필터가 걸리면 해당 브랜드만 값이 있다. */
  revenueByBrand: Record<string, number>;
  totalRevenue: number;
  cogs: Record<string, number>;
  cogsTotal: number;
  grossProfit: number;
  grossMarginPct: number | null;
  sga: Record<string, number>;
  fee: number;
  sgaTotal: number;
  opProfit: number;
  opMarginPct: number | null;
  interest: number;
  pretaxProfit: number;
  /** 매입원장 대사 — 원장 총액과 P&L 반영액의 차이를 성격별로 분해한다. */
  audit: {
    ledgerTotal: number;
    reflected: number;
    gap: number;
    finance: number;
    intra: number;
    card: number;
    refund: number;
    unclassified: number;
    unclassifiedCount: number;
    /** 시트 자동열(계정과목·구분)이 비어 있던 행. sheet 모드에서는 손익에 잡히지 않는다. */
    autoGapCount: number;
    autoGapAmount: number;
  };
  /** P&L에 넣지 않은 입금(매출원장) — 정산입금·재무입금 등. */
  nonPnlInflow: { settlement: number; financing: number; other: number };
  /** 참고 지표 */
  adCost: number; // 매출원장 광고비(L열)
  contribution: number; // 기여이익(Q열)
  orders: number; // 손익반영 행 수
};

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);

export function computeColumn(
  label: string,
  key: string,
  sales: SaleRow[],
  buys: BuyRow[],
  mode: CalcMode
): PnlColumn {
  const pnlSales = sales.filter((s) => s.inPnl);

  const revenueByBrand: Record<string, number> = {};
  for (const b of BRAND_ROWS) revenueByBrand[b] = 0;
  for (const s of pnlSales) revenueByBrand[saleBrand(s)] += s.netRevenue;
  const totalRevenue = sum(pnlSales, (s) => s.netRevenue);

  const byGubun = (g: string) => buys.filter((b) => gubunOf(b, mode) === g);
  const cogsRows = byGubun("매출원가");
  const sgaRows = byGubun("판관비");

  const cogs: Record<string, number> = {};
  for (const a of COGS_ACCOUNTS) cogs[a] = 0;
  for (const b of cogsRows) cogs[acctOf(b, mode)] = (cogs[acctOf(b, mode)] ?? 0) + b.amount;
  const cogsTotal = sum(cogsRows, (b) => b.amount);

  const sga: Record<string, number> = {};
  for (const a of SGA_ACCOUNTS) sga[a] = 0;
  for (const b of sgaRows) sga[acctOf(b, mode)] = (sga[acctOf(b, mode)] ?? 0) + b.amount;
  const fee = sum(pnlSales, (s) => s.fee);
  const sgaTotal = sum(sgaRows, (b) => b.amount) + fee;

  const grossProfit = totalRevenue - cogsTotal;
  const opProfit = grossProfit - sgaTotal;
  const interest = sum(byGubun("영업외비용"), (b) => b.amount);

  const unclassifiedRows = byGubun("미분류");
  const autoGapRows = buys.filter((b) => !b.acct);
  const ledgerTotal = sum(buys, (b) => b.amount);
  const reflected = cogsTotal + (sgaTotal - fee) + interest;

  const inflow = sales.filter((s) => !s.inPnl);

  return {
    label,
    key,
    revenueByBrand,
    totalRevenue,
    cogs,
    cogsTotal,
    grossProfit,
    grossMarginPct: totalRevenue ? (grossProfit / totalRevenue) * 100 : null,
    sga,
    fee,
    sgaTotal,
    opProfit,
    opMarginPct: totalRevenue ? (opProfit / totalRevenue) * 100 : null,
    interest,
    pretaxProfit: opProfit - interest,
    audit: {
      ledgerTotal,
      reflected,
      gap: ledgerTotal - reflected,
      finance: sum(byGubun("재무거래"), (b) => b.amount),
      intra: sum(byGubun("내부거래"), (b) => b.amount),
      card: sum(byGubun("검토대상"), (b) => b.amount),
      refund: sum(byGubun("매출차감"), (b) => b.amount),
      unclassified: sum(unclassifiedRows, (b) => b.amount),
      unclassifiedCount: unclassifiedRows.filter((b) => b.amount !== 0).length,
      autoGapCount: autoGapRows.length,
      autoGapAmount: sum(autoGapRows, (b) => b.amount),
    },
    nonPnlInflow: {
      settlement: sum(
        inflow.filter((s) => s.txType === "정산입금"),
        (s) => s.netRevenue
      ),
      financing: sum(
        inflow.filter((s) => s.txType === "재무입금"),
        (s) => s.netRevenue
      ),
      other: sum(
        inflow.filter((s) => s.txType !== "정산입금" && s.txType !== "재무입금"),
        (s) => s.netRevenue
      ),
    },
    adCost: sum(pnlSales, (s) => s.adCost),
    contribution: sum(pnlSales, (s) => s.contribution),
    orders: pnlSales.length,
  };
}

export type PnlReport = {
  kind: PeriodKind;
  periods: Period[];
  columns: PnlColumn[]; // 기간 열 + 마지막에 합계 열
  totalColumn: PnlColumn;
  /** 매출이 있는 가장 최근 기간(합계 제외). 없으면 0. */
  latestIdx: number;
  brand: BrandFilter;
  mode: CalcMode;
};

export type ReportOptions = {
  kind: PeriodKind;
  year: number;
  quarter?: number; // week 기준일 때
  yearCount?: number; // year 기준일 때
  brand?: BrandFilter;
  mode?: CalcMode;
};

/** 원장에서 기간별 손익표를 만든다. 브랜드 필터를 주면 그 브랜드만의 P&L이 된다. */
export function buildReport(opts: ReportOptions): PnlReport {
  const mode: CalcMode = opts.mode ?? "sheet";
  const brand = opts.brand ?? "";
  const periods =
    opts.kind === "month"
      ? monthPeriods(opts.year)
      : opts.kind === "week"
      ? weekPeriods(opts.year, opts.quarter ?? 1)
      : yearPeriods(opts.year, opts.yearCount ?? 5);

  const sales = SALES.filter((s) => matchBrand(saleBrand(s), brand, UNASSIGNED));
  const buys = BUYS.filter((b) => matchBrand(buyBrand(b), brand, UNASSIGNED_BUY));

  const columns = periods.map((p) =>
    computeColumn(
      p.label,
      p.key,
      sales.filter((s) => inPeriod(s, p, mode)),
      buys.filter((b) => inPeriod(b, p, mode)),
      mode
    )
  );

  const spanSales = sales.filter((s) => periods.some((p) => inPeriod(s, p, mode)));
  const spanBuys = buys.filter((b) => periods.some((p) => inPeriod(b, p, mode)));
  const totalLabel = opts.kind === "month" ? "연간 합계" : opts.kind === "week" ? "분기 합계" : "합계";
  const totalColumn = computeColumn(totalLabel, "total", spanSales, spanBuys, mode);

  let latestIdx = 0;
  columns.forEach((c, i) => {
    if (c.totalRevenue > 0 || c.audit.ledgerTotal > 0) latestIdx = i;
  });

  return { kind: opts.kind, periods, columns, totalColumn, latestIdx, brand, mode };
}

// ── 브랜드·채널·계정 단면 ──────────────────────────────────────────────────

export type BrandSlice = {
  brand: string;
  revenue: number;
  cogs: number;
  sga: number;
  opProfit: number;
  opMarginPct: number | null;
  ledgerTotal: number;
  interest: number;
};

/** 선택 기간의 브랜드별 손익. 매입원장 브랜드 미기재분은 "공통·미지정"으로 따로 잡힌다. */
export function brandSlices(period: Period, mode: CalcMode = "sheet"): BrandSlice[] {
  const rows = [...BRANDS, UNASSIGNED_BUY];
  return rows.map((b) => {
    const unassigned = b === UNASSIGNED_BUY;
    const sales = SALES.filter(
      (s) => inPeriod(s, period, mode) && (unassigned ? saleBrand(s) === UNASSIGNED : s.brand === b)
    );
    const buys = BUYS.filter(
      (x) => inPeriod(x, period, mode) && (unassigned ? buyBrand(x) === UNASSIGNED_BUY : x.brand === b)
    );
    const c = computeColumn(b, b, sales, buys, mode);
    return {
      brand: unassigned ? "공통·미지정" : b,
      revenue: c.totalRevenue,
      cogs: c.cogsTotal,
      sga: c.sgaTotal,
      opProfit: c.opProfit,
      opMarginPct: c.opMarginPct,
      ledgerTotal: c.audit.ledgerTotal,
      interest: c.interest,
    };
  });
}

export type ChannelSlice = {
  channel: string;
  revenue: number;
  adCost: number;
  roas: number | null;
  contribution: number;
  marginPct: number | null;
  sharePct: number | null;
  orders: number;
};

/** 선택 기간의 채널별 매출·기여이익. 시트 대시보드 ③과 같은 기준(순매출·손익반영 행). */
export function channelSlices(
  period: Period,
  brand: BrandFilter = "",
  mode: CalcMode = "sheet"
): ChannelSlice[] {
  const rows = SALES.filter(
    (s) => s.inPnl && inPeriod(s, period, mode) && matchBrand(saleBrand(s), brand, UNASSIGNED)
  );
  const total = sum(rows, (s) => s.netRevenue);
  const names = [...CHANNELS];
  for (const s of rows) if (s.channel && !names.includes(s.channel)) names.push(s.channel);
  return names
    .map((ch) => {
      const r = rows.filter((s) => s.channel === ch);
      const revenue = sum(r, (s) => s.netRevenue);
      const adCost = sum(r, (s) => s.adCost);
      const contribution = sum(r, (s) => s.contribution);
      return {
        channel: ch,
        revenue,
        adCost,
        roas: adCost ? revenue / adCost : null,
        contribution,
        marginPct: revenue ? (contribution / revenue) * 100 : null,
        sharePct: total ? (revenue / total) * 100 : null,
        orders: r.length,
      };
    })
    .filter((c) => c.revenue !== 0 || CHANNELS.includes(c.channel));
}

export type AccountSlice = {
  account: string;
  gubun: string;
  amount: number;
  count: number;
  sharePct: number | null;
};

/** 선택 기간의 계정과목별 매입(원장 전액 기준). 시트 대시보드 ④와 같다. */
export function accountSlices(
  period: Period,
  brand: BrandFilter = "",
  mode: CalcMode = "sheet"
): AccountSlice[] {
  const rows = BUYS.filter(
    (b) => inPeriod(b, period, mode) && matchBrand(buyBrand(b), brand, UNASSIGNED_BUY)
  );
  const total = sum(rows, (b) => b.amount);
  const order = new Map<string, { gubun: string; amount: number; count: number }>();
  for (const b of rows) {
    const a = acctOf(b, mode) || "(자동열 공란)";
    const cur = order.get(a) ?? { gubun: gubunOf(b, mode) || "(공란)", amount: 0, count: 0 };
    cur.amount += b.amount;
    cur.count += 1;
    order.set(a, cur);
  }
  return [...order.entries()]
    .map(([account, v]) => ({
      account,
      gubun: v.gubun,
      amount: v.amount,
      count: v.count,
      sharePct: total ? (v.amount / total) * 100 : null,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** 데이터가 실제로 존재하는 연도 목록(오름차순). */
export function availableYears(): number[] {
  const set = new Set<number>();
  for (const s of SALES) set.add(yearOf(s.date));
  for (const b of BUYS) set.add(yearOf(b.date));
  return [...set].sort((a, b) => a - b);
}

/** 원장 기준일 범위. */
export function ledgerRange(): { from: string; to: string } {
  const all = [...SALES.map((s) => s.date), ...BUYS.map((b) => b.date)].sort();
  return { from: all[0] ?? "", to: all[all.length - 1] ?? "" };
}

// ── 표시 도우미 ────────────────────────────────────────────────────────────

export const won = (n: number | null | undefined) =>
  n == null ? "-" : Math.round(n).toLocaleString("ko-KR");
export const pct = (n: number | null | undefined, digits = 1) =>
  n == null ? "-" : `${n.toFixed(digits)}%`;
