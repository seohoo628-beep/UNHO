import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  buildReport,
  brandSlices,
  channelSlices,
  accountSlices,
  availableYears,
  ledgerRange,
  BRANDS,
  UNASSIGNED,
  COGS_ACCOUNTS,
  SGA_ACCOUNTS,
  FEE_LABEL,
  GUBUN_DEFINITIONS,
  STORE_COST_RATES,
  SOURCE,
  won,
  pct,
  type CalcMode,
  type PeriodKind,
  type PnlColumn,
} from "@/lib/integrated-pnl";

export const dynamic = "force-dynamic";

const BRAND_TABS: { key: string; label: string }[] = [
  { key: "", label: "전사 통합" },
  ...BRANDS.map((b) => ({ key: b, label: b })),
  { key: UNASSIGNED, label: "미지정" },
];

const VIEWS: { key: PeriodKind; label: string }[] = [
  { key: "month", label: "월간" },
  { key: "week", label: "주간" },
  { key: "year", label: "연간" },
];

type Q = {
  view?: string;
  year?: string;
  q?: string;
  brand?: string;
  mode?: string;
  col?: string;
};

function qs(base: Q, patch: Q) {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) merged[k] = String(v);
  const s = new URLSearchParams(merged).toString();
  return `/pnl/integrated${s ? `?${s}` : ""}`;
}

/** 값이 음수면 붉게. 손익표 숫자 셀 공통 스타일. */
function Num({
  v,
  kind = "won",
  strong,
  highlight,
}: {
  v: number | null;
  kind?: "won" | "pct" | "count";
  strong?: boolean;
  highlight?: boolean;
}) {
  const text = kind === "pct" ? pct(v) : kind === "count" ? (v == null ? "-" : `${v}건`) : won(v);
  return (
    <td
      style={{
        textAlign: "right",
        whiteSpace: "nowrap",
        fontWeight: strong ? 700 : undefined,
        color: v != null && v < 0 ? "var(--owner)" : strong ? "var(--ink)" : "var(--ink-2)",
        background: highlight ? "var(--owner-bg)" : undefined,
      }}
    >
      {text}
    </td>
  );
}

export default async function IntegratedPnlPage({ searchParams }: { searchParams: Q }) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  const years = availableYears();
  const view: PeriodKind =
    searchParams.view === "week" ? "week" : searchParams.view === "year" ? "year" : "month";
  const mode: CalcMode = searchParams.mode === "rule" ? "rule" : "sheet";
  const brand = searchParams.brand ?? "";
  const defaultYear = years.includes(2026) ? 2026 : years[years.length - 1] ?? 2026;
  const year = Number(searchParams.year) || (view === "year" ? years[0] ?? defaultYear : defaultYear);
  const quarter = Math.min(4, Math.max(1, Number(searchParams.q) || 3));

  const report = buildReport({
    kind: view,
    year,
    quarter,
    yearCount: 5,
    brand,
    mode,
  });

  const colIdx = (() => {
    const i = report.columns.findIndex((c) => c.key === searchParams.col);
    return i >= 0 ? i : report.latestIdx;
  })();
  const col = report.columns[colIdx];
  const period = report.periods[colIdx];
  const total = report.totalColumn;

  const slices = brandSlices(period, mode);
  const channels = channelSlices(period, brand, mode);
  const accounts = accountSlices(period, brand, mode);
  const range = ledgerRange();

  const base: Q = {
    view,
    year: String(year),
    q: view === "week" ? String(quarter) : undefined,
    brand,
    mode: mode === "rule" ? "rule" : undefined,
  };

  const periodWord = view === "month" ? "월" : view === "week" ? "주차" : "연도";
  const brandLabel = BRAND_TABS.find((b) => b.key === brand)?.label ?? "전사 통합";

  // 손익표 라인 정의 — 시트 P&L 탭의 행 구성 그대로.
  type Line = {
    label: string;
    get: (c: PnlColumn) => number | null;
    kind?: "won" | "pct" | "count";
    head?: boolean;
    strong?: boolean;
    indent?: boolean;
  };
  const lines: Line[] = [
    { label: "매출 (순매출 · 손익반영 행만)", get: () => null, head: true },
    ...[...BRANDS, UNASSIGNED].map((b) => ({
      label: b,
      get: (c: PnlColumn) => c.revenueByBrand[b] ?? 0,
      indent: true,
    })),
    { label: "총매출", get: (c) => c.totalRevenue, strong: true },
    { label: "매출원가", get: () => null, head: true },
    ...COGS_ACCOUNTS.map((a) => ({
      label: a,
      get: (c: PnlColumn) => c.cogs[a] ?? 0,
      indent: true,
    })),
    { label: "매출원가 합", get: (c) => c.cogsTotal, strong: true },
    { label: "매출총이익", get: (c) => c.grossProfit, strong: true },
    { label: "매출총이익률", get: (c) => c.grossMarginPct, kind: "pct" as const },
    { label: "판매비와관리비", get: () => null, head: true },
    ...SGA_ACCOUNTS.map((a) => ({
      label: a,
      get: (c: PnlColumn) => c.sga[a] ?? 0,
      indent: true,
    })),
    { label: FEE_LABEL, get: (c) => c.fee, indent: true },
    { label: "판관비 합", get: (c) => c.sgaTotal, strong: true },
    { label: "영업이익", get: (c) => c.opProfit, strong: true },
    { label: "영업이익률", get: (c) => c.opMarginPct, kind: "pct" as const },
    { label: "영업외손익", get: () => null, head: true },
    { label: "이자비용", get: (c) => c.interest, indent: true },
    { label: "세전이익", get: (c) => c.pretaxProfit, strong: true },
  ];

  const auditLines: Line[] = [
    { label: "매입원장 기간 총액", get: (c) => c.audit.ledgerTotal },
    { label: "P&L 반영액 (원가+판관비+영업외)", get: (c) => c.audit.reflected },
    { label: "차액 (P&L 미반영)", get: (c) => c.audit.gap, strong: true },
    { label: "그중 재무거래(대여·상환)", get: (c) => c.audit.finance, indent: true },
    { label: "그중 내부거래(그룹)", get: (c) => c.audit.intra, indent: true },
    { label: "그중 카드대금(검토대상)", get: (c) => c.audit.card, indent: true },
    { label: "그중 환불(순매출에 반영)", get: (c) => c.audit.refund, indent: true },
    { label: "그중 미분류", get: (c) => c.audit.unclassified, indent: true },
    { label: "미분류 건수", get: (c) => c.audit.unclassifiedCount, kind: "count" as const, indent: true },
    {
      label: "시트 자동열 공란",
      get: (c) => c.audit.autoGapAmount,
      indent: true,
    },
    { label: "정산입금 (주문 매출과 중복)", get: (c) => c.nonPnlInflow.settlement },
    { label: "재무입금 (차입·투자)", get: (c) => c.nonPnlInflow.financing },
  ];

  const kpis: { label: string; value: string; alert?: boolean }[] = [
    { label: "총매출", value: won(col.totalRevenue) },
    { label: "매출원가", value: won(col.cogsTotal) },
    { label: "매출총이익", value: won(col.grossProfit) },
    { label: "판관비 합", value: won(col.sgaTotal) },
    { label: "영업이익", value: won(col.opProfit), alert: col.opProfit < 0 },
    { label: "영업이익률", value: pct(col.opMarginPct) },
    { label: "이자비용", value: won(col.interest) },
    { label: "세전이익", value: won(col.pretaxProfit), alert: col.pretaxProfit < 0 },
    { label: "매입원장 총액", value: won(col.audit.ledgerTotal) },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>통합 P&amp;L</h1>
          <p>
            운호컴퍼니(주당의비결·뷰티밤·파트너사) + 대운목장 + 신미집 통합 손익. 매출원장·매입원장에서
            시트와 같은 규칙으로 다시 계산한다.
          </p>
        </div>
        <div className="btn-row">
          <a className="btn" href={qs(base, { view, col: report.columns[colIdx].key })}>
            새로고침
          </a>
          <a className="btn" href="/pnl/integrated/ledger">
            원장 조회
          </a>
          <a
            className="btn"
            href={`https://docs.google.com/spreadsheets/d/${SOURCE.sheetId}/edit`}
            target="_blank"
            rel="noreferrer"
          >
            원본 시트
          </a>
        </div>
      </div>

      {/* ── 필터 ─────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div className="btn-row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
          {BRAND_TABS.map((b) => (
            <a
              key={b.key || "all"}
              className={`btn sm${b.key === brand ? " primary" : ""}`}
              href={qs(base, { brand: b.key, col: "" })}
            >
              {b.label}
            </a>
          ))}
        </div>
        <div className="btn-row" style={{ flexWrap: "wrap", marginBottom: 8 }}>
          {VIEWS.map((v) => (
            <a
              key={v.key}
              className={`btn sm${v.key === view ? " primary" : ""}`}
              href={qs(base, {
                view: v.key,
                year: String(v.key === "year" ? years[0] ?? year : year),
                col: "",
              })}
            >
              {v.label}
            </a>
          ))}
          <span style={{ width: 12 }} />
          {view !== "year" &&
            years.map((y) => (
              <a
                key={y}
                className={`btn sm${y === year ? " primary" : ""}`}
                href={qs(base, { year: String(y), col: "" })}
              >
                {y}년
              </a>
            ))}
          {view === "week" && (
            <>
              <span style={{ width: 12 }} />
              {[1, 2, 3, 4].map((q) => (
                <a
                  key={q}
                  className={`btn sm${q === quarter ? " primary" : ""}`}
                  href={qs(base, { q: String(q), col: "" })}
                >
                  {q}분기
                </a>
              ))}
            </>
          )}
        </div>
        <div className="btn-row" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <a
            className={`btn sm${mode === "sheet" ? " primary" : ""}`}
            href={qs(base, { mode: "" })}
          >
            시트 그대로
          </a>
          <a className={`btn sm${mode === "rule" ? " primary" : ""}`} href={qs(base, { mode: "rule" })}>
            매핑표 보정
          </a>
          <span className="muted" style={{ fontSize: 12 }}>
            {mode === "sheet"
              ? "매입원장 자동열(계정과목·구분)을 그대로 사용 — 시트 P&L 탭과 값이 정확히 일치합니다."
              : "자동열이 빈 행을 계정매핑표로 채워 계산 — 시트보다 비용이 더 잡힙니다."}
          </span>
        </div>
      </div>

      {/* ── 기간 선택 ────────────────────────────────────────── */}
      <div className="btn-row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        {report.columns.map((c, i) => (
          <a
            key={c.key}
            className={`btn sm${i === colIdx ? " primary" : ""}`}
            href={qs(base, { col: c.key })}
          >
            {c.label}
          </a>
        ))}
      </div>

      {/* ── KPI ─────────────────────────────────────────────── */}
      <div className="section-title">
        {brandLabel} · {col.label} 손익
      </div>
      <div className="grid cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="card">
            <div className={`stat${k.alert ? " alert" : ""}`}>
              <div className="lbl">{k.label}</div>
              <div className="n" style={{ fontSize: 22 }}>
                {k.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 손익계산서 ──────────────────────────────────────── */}
      <div className="section-title">
        {periodWord}별 손익계산서 —{" "}
        {view === "week" ? `${year}년 ${quarter}분기` : view === "year" ? "5개년" : `${year}년`}
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "var(--surface)" }}>항목</th>
              {report.columns.map((c, i) => (
                <th
                  key={c.key}
                  style={{
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    color: i === colIdx ? "var(--owner)" : undefined,
                    fontWeight: i === colIdx ? 700 : undefined,
                  }}
                >
                  {c.label}
                </th>
              ))}
              <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>{total.label}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label}>
                <td
                  data-label="항목"
                  style={{
                    position: "sticky",
                    left: 0,
                    background: "var(--surface)",
                    whiteSpace: "nowrap",
                    paddingLeft: l.indent ? 22 : undefined,
                    fontWeight: l.head || l.strong ? 700 : undefined,
                    color: l.head ? "var(--ink-2)" : undefined,
                  }}
                >
                  {l.label}
                </td>
                {report.columns.map((c, i) => (
                  <Num
                    key={c.key}
                    v={l.head ? null : l.get(c)}
                    kind={l.kind}
                    strong={l.strong}
                    highlight={i === colIdx}
                  />
                ))}
                <Num v={l.head ? null : l.get(total)} kind={l.kind} strong />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        매출은 매출원장 순매출 중 손익반영 행만 집계한다(정산입금·차입금·투자금·매입 오기재는 제외).
        판관비의 결제·판매수수료는 매출원장 수수료 열에서 온다.
      </p>

      {/* ── 브랜드별 ────────────────────────────────────────── */}
      <div className="section-title">브랜드별 손익 — {col.label}</div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>브랜드</th>
              <th style={{ textAlign: "right" }}>매출</th>
              <th style={{ textAlign: "right" }}>매출원가</th>
              <th style={{ textAlign: "right" }}>판관비</th>
              <th style={{ textAlign: "right" }}>영업이익</th>
              <th style={{ textAlign: "right" }}>영업이익률</th>
              <th style={{ textAlign: "right" }}>이자비용</th>
              <th style={{ textAlign: "right" }}>매입원장 총액</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {slices.map((s) => (
              <tr key={s.brand}>
                <td data-label="브랜드" style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                  {s.brand}
                </td>
                <Num v={s.revenue} />
                <Num v={s.cogs} />
                <Num v={s.sga} />
                <Num v={s.opProfit} strong />
                <Num v={s.opMarginPct} kind="pct" />
                <Num v={s.interest} />
                <Num v={s.ledgerTotal} />
                <td style={{ whiteSpace: "nowrap" }}>
                  {BRANDS.includes(s.brand as (typeof BRANDS)[number]) && (
                    <a className="btn sm" href={qs(base, { brand: s.brand, col: col.key })}>
                      단독 보기
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        &ldquo;공통·미지정&rdquo;은 매입원장 브랜드 열이 비어 있는 행이다. 브랜드를 지정하면 해당
        브랜드 손익으로 옮겨간다. 대운목장이 주당의비결에 지급한 마케팅비 등 그룹 내부거래는 손익에서
        제외돼 검증 블록에만 표시된다.
      </p>

      {/* ── 채널·계정 ───────────────────────────────────────── */}
      <div className="grid cols-2">
        <div>
          <div className="section-title">채널별 매출 — {col.label}</div>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>채널</th>
                  <th style={{ textAlign: "right" }}>매출</th>
                  <th style={{ textAlign: "right" }}>기여이익</th>
                  <th style={{ textAlign: "right" }}>이익률</th>
                  <th style={{ textAlign: "right" }}>비중</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.channel}>
                    <td data-label="채널" style={{ whiteSpace: "nowrap" }}>
                      {c.channel}
                    </td>
                    <Num v={c.revenue} />
                    <Num v={c.contribution} />
                    <Num v={c.marginPct} kind="pct" />
                    <Num v={c.sharePct} kind="pct" />
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 700 }}>합계</td>
                  <Num v={channels.reduce((a, c) => a + c.revenue, 0)} strong />
                  <Num v={channels.reduce((a, c) => a + c.contribution, 0)} strong />
                  <td></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            기여이익 = 순매출 − 제품원가 − 판매수수료 − 광고비. 판관비 차감 전이라 영업이익이 아니다.
          </p>
        </div>

        <div>
          <div className="section-title">계정과목별 매입 — {col.label}</div>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>계정과목</th>
                  <th>구분</th>
                  <th style={{ textAlign: "right" }}>금액</th>
                  <th style={{ textAlign: "right" }}>건수</th>
                  <th style={{ textAlign: "right" }}>비중</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      이 기간에 매입 기록이 없습니다.
                    </td>
                  </tr>
                ) : (
                  accounts.map((a) => (
                    <tr key={a.account}>
                      <td data-label="계정" style={{ whiteSpace: "nowrap" }}>
                        {a.account}
                      </td>
                      <td data-label="구분" style={{ whiteSpace: "nowrap", color: "var(--ink-2)" }}>
                        {a.gubun}
                      </td>
                      <Num v={a.amount} />
                      <Num v={a.count} kind="count" />
                      <Num v={a.sharePct} kind="pct" />
                    </tr>
                  ))
                )}
                <tr>
                  <td style={{ fontWeight: 700 }}>합계</td>
                  <td></td>
                  <Num v={accounts.reduce((a, c) => a + c.amount, 0)} strong />
                  <Num v={accounts.reduce((a, c) => a + c.count, 0)} kind="count" strong />
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            매입원장 전액 기준이라 P&amp;L 반영액과 다르다. 미분류가 남아 있으면 그만큼 손익 비용이
            실제보다 작게 나온다.
          </p>
        </div>
      </div>

      {/* ── 검증 ───────────────────────────────────────────── */}
      <div className="section-title">검증 — 매입원장 대사 · P&amp;L 미포함 입금</div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "var(--surface)" }}>항목</th>
              {report.columns.map((c, i) => (
                <th
                  key={c.key}
                  style={{
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    color: i === colIdx ? "var(--owner)" : undefined,
                  }}
                >
                  {c.label}
                </th>
              ))}
              <th style={{ textAlign: "right" }}>{total.label}</th>
            </tr>
          </thead>
          <tbody>
            {auditLines.map((l) => (
              <tr key={l.label}>
                <td
                  data-label="항목"
                  style={{
                    position: "sticky",
                    left: 0,
                    background: "var(--surface)",
                    whiteSpace: "nowrap",
                    paddingLeft: l.indent ? 22 : undefined,
                    fontWeight: l.strong ? 700 : undefined,
                  }}
                >
                  {l.label}
                </td>
                {report.columns.map((c, i) => (
                  <Num key={c.key} v={l.get(c)} kind={l.kind} strong={l.strong} highlight={i === colIdx} />
                ))}
                <Num v={l.get(total)} kind={l.kind} strong />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 기준 ───────────────────────────────────────────── */}
      <div className="section-title">계산 기준</div>
      <div className="grid cols-2">
        <div className="card">
          <div className="lbl" style={{ fontWeight: 700, marginBottom: 6 }}>
            구분 정의 (계정매핑 시트)
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--ink-2)" }}>
            {GUBUN_DEFINITIONS.map((d) => (
              <li key={d} style={{ marginBottom: 4 }}>
                {d}
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="lbl" style={{ fontWeight: 700, marginBottom: 6 }}>
            매장 원가율 (매출원장 제품원가 산정에 사용)
          </div>
          <table className="tbl" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>브랜드</th>
                <th style={{ textAlign: "right" }}>식자재·주류 매입</th>
                <th style={{ textAlign: "right" }}>매장 순매출</th>
                <th style={{ textAlign: "right" }}>적용 원가율</th>
              </tr>
            </thead>
            <tbody>
              {STORE_COST_RATES.map((r) => (
                <tr key={r.brand}>
                  <td data-label="브랜드">{r.brand}</td>
                  <Num v={r.purchase} />
                  <Num v={r.netRevenue} />
                  <Num v={r.rate * 100} kind="pct" />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            원장 기간 {range.from} ~ {range.to} · 시트 캡처 {SOURCE.capturedAt} ·{" "}
            {mode === "sheet" ? "시트 그대로" : "매핑표 보정"} 기준
          </p>
        </div>
      </div>

      {col.audit.autoGapCount > 0 && mode === "sheet" && (
        <div className="flag" style={{ marginTop: 12 }}>
          이 기간 매입원장 {col.audit.autoGapCount}건({won(col.audit.autoGapAmount)}원)은 시트의
          계정과목·구분 자동열이 비어 있어 어느 손익 라인에도 잡히지 않는다.
          <div className="fix" style={{ marginTop: 6 }}>
            &ldquo;매핑표 보정&rdquo;을 누르면 카테고리 기준으로 계정과목을 채워 다시 계산한다. 근본
            해결은 원본 시트 매입원장 M·N열 수식을 마지막 행까지 채우는 것이다.
          </div>
        </div>
      )}
      {col.audit.unclassified > 0 && (
        <div className="flag" style={{ marginTop: 12 }}>
          미분류 매입 {col.audit.unclassifiedCount}건 · {won(col.audit.unclassified)}원이 손익에
          반영되지 않았다.
          <div className="fix" style={{ marginTop: 6 }}>
            매입원장 카테고리(E열)를 채우면 계정매핑표를 거쳐 자동으로 손익에 들어온다.
          </div>
        </div>
      )}
    </div>
  );
}
