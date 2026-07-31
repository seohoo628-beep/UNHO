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

export default async function PnlPage() {
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
      .limit(30),
  ]);

  const live = sheet.ok && sheet.rows ? extractPnlKpis(sheet.rows) : null;
  const snapshots = (snaps ?? []) as {
    snapshot_date: string;
    revenue: number | null;
    op_profit: number | null;
    margin_pct: number | null;
    roas: number | null;
    orders: number | null;
  }[];

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

      <div className="section-title">스냅샷 추이 (최근 30회)</div>
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
