import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchPnlRows, extractPnlKpis, getPnlSheet } from "@/lib/pnl";
import { fmtDate } from "@/lib/time";
import PnlSnapshotButton from "@/components/PnlSnapshotButton";

export const dynamic = "force-dynamic";

const won = (n: number | null) => (n == null ? "-" : Math.round(n).toLocaleString() + "원");
const pct = (n: number | null) => (n == null ? "-" : n + "%");
const cnt = (n: number | null) => (n == null ? "-" : Math.round(n).toLocaleString());

export default async function PnlPage({
  searchParams,
}: {
  searchParams: { year?: string };
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
      .limit(400),
  ]);

  const live = sheet.ok && sheet.rows ? extractPnlKpis(sheet.rows) : null;
  type Snap = {
    snapshot_date: string;
    revenue: number | null;
    net_revenue: number | null;
    op_profit: number | null;
    margin_pct: number | null;
    roas: number | null;
    orders: number | null;
    aov: number | null;
  };
  const allSnaps = (snaps ?? []) as Snap[];

  // 연도 목록·필터
  const years = [...new Set(allSnaps.map((s) => s.snapshot_date.slice(0, 4)))].sort().reverse();
  const selectedYear = searchParams.year && years.includes(searchParams.year)
    ? searchParams.year
    : years[0];
  const yearSnaps = allSnaps.filter((s) => s.snapshot_date.slice(0, 4) === selectedYear);

  // 월별 요약: 각 월의 "가장 최근 스냅샷"을 그 달 대표값으로.
  const monthly = new Map<string, Snap>();
  for (const s of [...yearSnaps].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))) {
    monthly.set(s.snapshot_date.slice(0, 7), s); // 나중 값이 덮어써 최신이 남음
  }
  const monthlyRows = [...monthly.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  const snapshots = yearSnaps.slice(0, 40);

  const cards = live
    ? [
        { l: "총 매출", v: won(live.revenue) },
        { l: "순 매출", v: won(live.net_revenue) },
        { l: "영업 이익", v: won(live.op_profit) },
        { l: "이익률", v: pct(live.margin_pct) },
        { l: "광고비", v: won(live.ad_cost) },
        { l: "ROAS", v: cnt(live.roas) },
        { l: "환불률", v: pct(live.refund_pct) },
        { l: "주문건수", v: cnt(live.orders) },
        { l: "객단가", v: won(live.aov) },
      ]
    : [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>P&amp;L</h1>
          <p>구글 P&amp;L 시트를 읽어 핵심 KPI를 표시하고, 스냅샷으로 추이를 트래킹한다.</p>
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
            구글 시트 → 공유 → "링크가 있는 모든 사용자"를 <b>뷰어</b>로 설정하세요(읽기 전용).
          </div>
        </div>
      ) : (
        <div className="grid cols-3">
          {cards.map((c) => (
            <div key={c.l} className="card">
              <div className="stat">
                <div className="lbl">{c.l}</div>
                <div className="n" style={{ fontSize: 22 }}>{c.v}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 연도 필터 + 월별 요약 */}
      {years.length > 0 && (
        <>
          <div className="section-title">월별 요약</div>
          <div className="btn-row" style={{ marginBottom: 12 }}>
            {years.map((y) => (
              <a
                key={y}
                className={`btn sm${y === selectedYear ? " primary" : ""}`}
                href={`/pnl?year=${y}`}
              >
                {y}년
              </a>
            ))}
          </div>
          <div className="card" style={{ padding: 0 }}>
            {monthlyRows.length === 0 ? (
              <div className="empty">{selectedYear}년 데이터가 없습니다.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>월</th>
                    <th>총 매출</th>
                    <th>순 매출</th>
                    <th>영업 이익</th>
                    <th>이익률</th>
                    <th>ROAS</th>
                    <th>주문</th>
                    <th>객단가</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map(([m, s]) => (
                    <tr key={m}>
                      <td>{m.slice(5)}월</td>
                      <td>{won(s.revenue)}</td>
                      <td>{won(s.net_revenue)}</td>
                      <td>{won(s.op_profit)}</td>
                      <td>{pct(s.margin_pct)}</td>
                      <td>{cnt(s.roas)}</td>
                      <td>{cnt(s.orders)}</td>
                      <td>{won(s.aov)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            각 월의 가장 최근 스냅샷 값입니다. 매일 자동 수집되면 월말 값이 그 달을 대표합니다.
          </p>
        </>
      )}

      <div className="section-title">
        스냅샷 상세 {years.length > 0 ? `(${selectedYear}년)` : ""}
      </div>
      <div className="card" style={{ padding: 0 }}>
        {snapshots.length === 0 ? (
          <div className="empty">
            아직 스냅샷이 없습니다. "지금 스냅샷 저장"으로 오늘 값을 기록하세요. 평일 08:00 자동 수집도 됩니다.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>일자</th>
                <th>총 매출</th>
                <th>영업 이익</th>
                <th>이익률</th>
                <th>ROAS</th>
                <th>주문건수</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s, i) => (
                <tr key={i}>
                  <td>{fmtDate(s.snapshot_date)}</td>
                  <td>{won(s.revenue)}</td>
                  <td>{won(s.op_profit)}</td>
                  <td>{pct(s.margin_pct)}</td>
                  <td>{cnt(s.roas)}</td>
                  <td>{cnt(s.orders)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
