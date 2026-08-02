import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchPnlRows,
  extractMonthlyPnl,
  getPnlSheet,
  debugPnlGrid,
  fetchPnlRaw,
} from "@/lib/pnl";
import { fmtDate } from "@/lib/time";
import PnlSnapshotButton from "@/components/PnlSnapshotButton";
import LockSection from "@/components/LockSection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const won = (n: number | null) => (n == null ? "-" : Math.round(n).toLocaleString() + "원");
const pct = (n: number | null) => (n == null ? "-" : n + "%");
const fmt = (n: number | null, kind: "won" | "pct") => (kind === "pct" ? pct(n) : won(n));

export default async function PnlPage({
  searchParams,
}: {
  searchParams: { month?: string; debug?: string };
}) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const cfg = await getPnlSheet();
  const [sheet, { data: snaps }] = await Promise.all([
    fetchPnlRows(),
    supabase
      .from("pnl_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(60),
  ]);

  const monthly = sheet.ok && sheet.rows ? extractMonthlyPnl(sheet.rows) : null;
  const periodWord = monthly?.periodKind === "주차" ? "주차" : "월";

  // 선택 기간(기본: 매출이 있는 최근 기간).
  const monthLabels = monthly?.periods ?? [];
  const selectedMonth =
    searchParams.month && monthLabels.includes(searchParams.month)
      ? searchParams.month
      : monthLabels[monthly?.latestIdx ?? 0];
  const selIdx = monthLabels.indexOf(selectedMonth);

  // KPI 카드 = 선택 기간의 손익 라인.
  const cards =
    monthly && selIdx >= 0
      ? monthly.lines.map((l) => ({ l: l.label, v: fmt(l.values[selIdx], l.kind), kind: l.kind }))
      : [];

  // 진단
  const showDebug = user.role === "owner" && searchParams.debug === "1";
  const debugRows = showDebug && sheet.ok && sheet.rows ? debugPnlGrid(sheet.rows) : null;
  const debugRaw = showDebug ? await fetchPnlRaw() : null;

  type Snap = {
    snapshot_date: string;
    revenue: number | null;
    op_profit: number | null;
    margin_pct: number | null;
    ad_cost: number | null;
  };
  const snapshots = ((snaps ?? []) as Snap[]).filter(
    (s) => s.revenue != null || s.op_profit != null
  );

  return (
    <LockSection storageKey="pnl-unlock-v1" password="1233" heading="P&L 현황">
    <div>
      <div className="page-head">
        <div>
          <h1>P&amp;L</h1>
          <p>구글 &ldquo;월간 손익계산서(P&amp;L)&rdquo; 시트를 읽어 월별 손익을 표시한다.</p>
        </div>
        <div className="btn-row">
          <PnlSnapshotButton />
          <a
            className="btn"
            href={`https://docs.google.com/spreadsheets/d/${cfg.id}/edit#gid=${cfg.gid}`}
            target="_blank"
            rel="noreferrer"
          >
            시트 열기
          </a>
        </div>
      </div>

      {!sheet.ok ? (
        <div className="flag">
          {sheet.error}
          <div className="fix" style={{ marginTop: 6 }}>
            구글 시트 → 공유 → &ldquo;링크가 있는 모든 사용자&rdquo;를 <b>뷰어</b>로 설정하세요.
          </div>
        </div>
      ) : !monthly ? (
        <div className="flag">
          손익표를 찾지 못했습니다. 연동된 탭에 &ldquo;항목&rdquo; 헤더와 &ldquo;1월&hellip;12월&rdquo;(또는
          &ldquo;1주차&hellip;13주차&rdquo;) 기간 열이 있는지 확인하세요.
        </div>
      ) : (
        <>
          {/* 월 선택 */}
          <div className="btn-row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            {monthLabels.map((m) => (
              <a
                key={m}
                className={`btn sm${m === selectedMonth ? " primary" : ""}`}
                href={`/pnl?month=${encodeURIComponent(m)}`}
              >
                {m}
              </a>
            ))}
          </div>

          {/* 선택 월 KPI 카드 */}
          <div className="section-title">{selectedMonth} 손익</div>
          <div className="grid cols-3">
            {cards.map((c) => (
              <div key={c.l} className="card">
                <div className="stat">
                  <div className="lbl">{c.l}</div>
                  <div className="n" style={{ fontSize: 22 }}>
                    {c.v}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 기간별 손익 표 */}
          <div className="section-title">{periodWord}별 손익 (전체)</div>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, background: "var(--card, #fff)" }}>항목</th>
                  {monthLabels.map((m) => (
                    <th
                      key={m}
                      style={{
                        textAlign: "right",
                        whiteSpace: "nowrap",
                        color: m === selectedMonth ? "var(--owner)" : undefined,
                        fontWeight: m === selectedMonth ? 700 : undefined,
                      }}
                    >
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly.lines.map((line) => (
                  <tr key={line.key}>
                    <td style={{ position: "sticky", left: 0, background: "var(--card, #fff)", whiteSpace: "nowrap" }}>
                      {line.label}
                    </td>
                    {line.values.map((v, i) => (
                      <td
                        key={i}
                        style={{
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          color:
                            v != null && v < 0
                              ? "var(--owner)"
                              : monthLabels[i] === selectedMonth
                              ? "var(--ink)"
                              : "var(--ink-2)",
                          background: monthLabels[i] === selectedMonth ? "var(--owner-bg)" : undefined,
                          fontWeight: monthLabels[i] === selectedMonth ? 600 : undefined,
                        }}
                      >
                        {fmt(v, line.kind)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            연동 탭({cfg.gid})을 실시간으로 읽어 표시합니다. 시트를 수정하면 새로고침 시 바로 반영됩니다.
            값이 0인 {periodWord}는 아직 입력 전입니다.
          </p>
        </>
      )}

      {debugRaw && (
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          <div className="lbl" style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 6 }}>
            진단(debug): via {debugRaw.via} · status {debugRaw.status} · 선택 길이 {debugRaw.len} ·
            export {debugRaw.exportLen} · gviz {debugRaw.gvizLen}
          </div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              fontSize: 11,
              margin: 0,
              maxHeight: 320,
              overflow: "auto",
              background: "var(--bg-2, #0000000a)",
              padding: 8,
              borderRadius: 6,
            }}
          >
            {debugRaw.head || "(빈 응답)"}
          </pre>
        </div>
      )}

      {debugRows && (
        <div className="card" style={{ padding: 12, marginTop: 12, overflowX: "auto" }}>
          <div className="lbl" style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 6 }}>
            진단(debug): 앱이 읽은 시트 격자 앞부분
          </div>
          <table className="tbl" style={{ fontSize: 11 }}>
            <tbody>
              {debugRows.map((r, ri) => (
                <tr key={ri}>
                  <td className="mono" style={{ color: "var(--ink-3)" }}>{ri}</td>
                  {r.map((c, ci) => (
                    <td key={ci} className="mono" style={{ whiteSpace: "nowrap" }}>
                      {c || "·"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 스냅샷 저장 이력 (선택 월 기준으로 저장됨) */}
      <div className="section-title">스냅샷 저장 이력</div>
      <div className="card" style={{ padding: 0 }}>
        {snapshots.length === 0 ? (
          <div className="empty">
            아직 저장된 스냅샷이 없습니다. &ldquo;지금 스냅샷 저장&rdquo;으로 최근 월 손익을 기록으로 남길 수 있습니다.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>저장일</th>
                <th>총매출</th>
                <th>영업이익</th>
                <th>영업이익률</th>
                <th>광고비</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s, i) => (
                <tr key={i}>
                  <td>{fmtDate(s.snapshot_date)}</td>
                  <td>{won(s.revenue)}</td>
                  <td>{won(s.op_profit)}</td>
                  <td>{pct(s.margin_pct)}</td>
                  <td>{won(s.ad_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </LockSection>
  );
}
