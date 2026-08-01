"use client";

import Link from "next/link";
import { useData, inScope } from "@dining/lib/store";
import { Stat, Card, Bar, Badge } from "@dining/components/ui";
import { STORES, storeName } from "@dining/lib/stores";
import { derivePnl, sumPnl } from "@dining/lib/pnl";
import { won, manwon, pct, num, ratio } from "@dining/lib/format";

export default function Dashboard() {
  const { data, scope, ready } = useData();
  if (!ready) return <Loading />;

  const goals = inScope(data.goals, scope);
  const tasks = inScope(data.tasks, scope);
  const reservations = inScope(data.reservations, scope);
  const ingredients = inScope(data.ingredients, scope);
  const campaigns = inScope(data.campaigns, scope);
  const pnl = inScope(data.pnl, scope);
  const announcements = inScope(data.announcements, scope);

  // 최신 월 손익
  const latestMonth = [...pnl].sort((a, b) => b.month.localeCompare(a.month))[0]?.month;
  const latestPnl = sumPnl(pnl.filter((p) => p.month === latestMonth));

  const today = "2026-08-01";
  const todayRes = reservations.filter((r) => r.date === today && r.status !== "cancelled");
  const pendingTasks = tasks.filter((t) => t.status !== "done");
  const lowStock = ingredients.filter((i) => i.stock < i.parLevel);

  const revGoal = goals.filter((g) => g.metric === "매출");
  const revTarget = revGoal.reduce((s, g) => s + g.target, 0);
  const revActual = revGoal.reduce((s, g) => s + g.actual, 0);

  const mkSpent = campaigns.reduce((s, c) => s + c.spent, 0);
  const mkConv = campaigns.reduce((s, c) => s + c.conversions, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>대시보드</h1>
          <p>
            {scope === "all" ? "신미집 · 대운목장 통합 현황" : storeName(scope) + " 운영 현황"}
            {latestMonth ? ` · 손익 기준 ${latestMonth}` : ""}
          </p>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-4">
        <Stat
          icon="💳"
          label="8월 매출(목표 대비)"
          value={manwon(revActual)}
          foot={
            <>
              목표 {manwon(revTarget)} · 달성 {pct(ratio(revActual, revTarget), 0)}
            </>
          }
        />
        <Stat
          icon="📈"
          label={`영업이익 (${latestMonth ?? "-"})`}
          value={manwon(latestPnl.operatingProfit)}
          accent={latestPnl.operatingProfit >= 0 ? "var(--green)" : "var(--red)"}
          foot={`영업이익률 ${pct(latestPnl.opMargin)}`}
        />
        <Stat
          icon="📅"
          label="오늘 예약"
          value={`${todayRes.length}팀`}
          foot={`${todayRes.reduce((s, r) => s + r.partySize, 0)}명 · 대기 ${
            todayRes.filter((r) => r.status === "pending").length
          }`}
        />
        <Stat
          icon="⚠️"
          label="발주 필요 품목"
          value={`${lowStock.length}건`}
          accent={lowStock.length ? "var(--amber)" : undefined}
          foot={`진행 중 업무 ${pendingTasks.length}건`}
        />
      </div>

      <div className="grid grid-2 mt-24" style={{ alignItems: "start" }}>
        {/* 목표 달성 현황 */}
        <Card title="🎯 8월 목표 달성 현황" pad={false}>
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            {goals.length === 0 && <div className="muted">등록된 목표가 없습니다.</div>}
            {goals.map((g) => {
              const r = ratio(g.actual, g.target);
              const color = r >= 90 ? "var(--green)" : r >= 60 ? "var(--amber)" : "var(--red)";
              const val = (n: number) =>
                g.unit === "원" ? manwon(n) : g.unit.startsWith("점") ? (n / 10).toFixed(1) : num(n);
              return (
                <div key={g.id}>
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>
                      {scope === "all" && (
                        <span className="muted" style={{ fontWeight: 400 }}>
                          [{storeName(g.storeId)}]{" "}
                        </span>
                      )}
                      {g.title}
                    </span>
                    <span className="num" style={{ fontWeight: 700 }}>
                      {val(g.actual)}{" "}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        / {val(g.target)} {g.unit === "원" || g.unit.startsWith("점") ? "" : g.unit}
                      </span>
                    </span>
                  </div>
                  <Bar value={r} color={color} />
                </div>
              );
            })}
          </div>
        </Card>

        {/* 오늘 예약 */}
        <Card
          title="📅 오늘 예약"
          action={
            <Link href="/dining/reservations" className="btn sm ghost">
              전체보기 →
            </Link>
          }
          pad={false}
        >
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>고객</th>
                  <th className="num">인원</th>
                  {scope === "all" && <th>매장</th>}
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {todayRes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      오늘 예약이 없습니다.
                    </td>
                  </tr>
                )}
                {todayRes
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.time}</td>
                      <td>
                        {r.name}
                        <div className="muted" style={{ fontSize: 11 }}>
                          {r.channel}
                        </div>
                      </td>
                      <td className="num">{r.partySize}</td>
                      {scope === "all" && <td className="muted">{storeName(r.storeId)}</td>}
                      <td>{resBadge(r.status)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid grid-3 mt-24" style={{ alignItems: "start" }}>
        {/* 매장 요약 카드 */}
        {(scope === "all" ? STORES.map((s) => s.id) : [scope]).map((sid) => {
          const sp = data.pnl.filter((p) => p.storeId === sid && p.month === latestMonth);
          const d = derivePnl(sp[0] ?? emptyPnl(sid, latestMonth));
          const store = STORES.find((s) => s.id === sid)!;
          return (
            <Card key={sid} pad>
              <div className="row between">
                <div className="row">
                  <span style={{ fontSize: 22 }}>{store.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{store.name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {store.concept}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-16" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <MiniRow label="매출" value={won(d.revenue)} />
                <MiniRow label="원가율" value={pct(d.foodCostRate)} tone={d.foodCostRate > 35 ? "amber" : "green"} />
                <MiniRow label="인건비율" value={pct(d.laborRate)} />
                <MiniRow
                  label="영업이익"
                  value={won(d.operatingProfit)}
                  tone={d.operatingProfit >= 0 ? "green" : "red"}
                />
              </div>
            </Card>
          );
        })}

        {/* 마케팅 요약 */}
        <Card
          title="📣 마케팅"
          action={
            <Link href="/dining/marketing" className="btn sm ghost">
              →
            </Link>
          }
        >
          <MiniRow label="진행 캠페인" value={`${campaigns.filter((c) => c.status === "running").length}건`} />
          <div className="mt-16" />
          <MiniRow label="집행 비용" value={won(mkSpent)} />
          <div className="mt-16" />
          <MiniRow label="전환(예약·방문)" value={`${num(mkConv)}건`} tone="brand" />
          <div className="mt-16" />
          <MiniRow
            label="전환당 비용"
            value={mkConv ? won(Math.round(mkSpent / mkConv)) : "-"}
          />
        </Card>

        {/* 공지 */}
        <Card
          title="📌 전달사항"
          action={
            <Link href="/dining/announcements" className="btn sm ghost">
              →
            </Link>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {announcements.slice(0, 4).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span
                  className="dot"
                  style={{
                    marginTop: 6,
                    background:
                      a.priority === "high" ? "var(--red)" : a.priority === "mid" ? "var(--amber)" : "var(--text-3)",
                  }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {a.pinned && "📍 "}
                    {a.title}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {storeName(a.storeId)} · {a.createdAt}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function MiniRow({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" | "red" | "brand" }) {
  const color =
    tone === "green"
      ? "var(--green)"
      : tone === "amber"
      ? "var(--amber)"
      : tone === "red"
      ? "var(--red)"
      : tone === "brand"
      ? "var(--brand)"
      : "var(--text)";
  return (
    <div className="row between">
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function resBadge(status: string) {
  const map: Record<string, [string, string]> = {
    confirmed: ["green", "확정"],
    pending: ["amber", "대기"],
    seated: ["blue", "착석"],
    cancelled: ["gray", "취소"],
    noshow: ["red", "노쇼"],
  };
  const [tone, label] = map[status] ?? ["gray", status];
  return <Badge tone={tone as any}>{label}</Badge>;
}

function emptyPnl(storeId: any, month: string) {
  return { id: "e", storeId, month, revenue: 0, foodCost: 0, labor: 0, rent: 0, utilities: 0, marketing: 0, other: 0 };
}

function Loading() {
  return <div className="empty">불러오는 중…</div>;
}
