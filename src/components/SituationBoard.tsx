import Link from "next/link";
import type { Situation } from "@/lib/situation";

// 대표 통합 상황판 — 돈·재고·업무·AI·고객을 한 화면에. 숫자는 각 메뉴로 바로 연결된다.

export function krw(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(a >= 1e9 ? 0 : 1)}억`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString("ko-KR")}만`;
  return `${sign}${Math.round(a).toLocaleString("ko-KR")}원`;
}

type Tone = "owner" | "warn" | "ok" | "accent" | undefined;
const color = (t: Tone) => (t === "owner" ? "var(--owner)" : t === "warn" ? "var(--warn)" : t === "ok" ? "var(--ok)" : t === "accent" ? "var(--accent)" : "var(--ink)");

function Tile({ href, label, value, sub, tone }: { href: string; label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <Link href={href} className="card" style={{ margin: 0, padding: "12px 14px", display: "block", textDecoration: "none", color: "inherit" }}>
      <div className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, marginTop: 4, color: color(tone), fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.35 }}>{sub}</div>}
    </Link>
  );
}

const NA = "데이터 없음";

export default function SituationBoard({ s, compact = false }: { s: Situation; compact?: boolean }) {
  const p = s.pnl;
  const trend = p && p.rev7Prev > 0 ? Math.round(((p.rev7 - p.rev7Prev) / p.rev7Prev) * 100) : null;
  const c = s.cash;
  const net7 = c ? c.recv7 - c.pay7 : 0;
  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>대표 상황판</div>
        {compact && <Link href="/situation" className="muted" style={{ fontSize: 12 }}>전체 보기</Link>}
      </div>

      {s.ai?.report && (
        <Link href="/agent-routines#review" className="card" style={{ display: "block", margin: "0 0 10px", padding: "12px 14px", borderLeft: "4px solid var(--accent)", textDecoration: "none", color: "inherit" }}>
          <div className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>AI 경영지원 · 대표 일일 보고</div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>{s.ai.report}</div>
        </Link>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
        <Tile href="/pnl" label={p ? `매출 · ${p.date.slice(5)}` : "매출"} value={p ? krw(p.revenue) : NA}
          sub={p ? `최근 7일 ${krw(p.rev7)}${trend === null ? "" : ` · 전주 대비 ${trend > 0 ? "+" : ""}${trend}%`}` : "P&L 스냅샷 입력 필요"} tone={trend !== null && trend < 0 ? "owner" : "accent"} />
        <Tile href="/pnl" label="영업이익" value={p ? krw(p.opProfit) : NA}
          sub={p ? `이익률 ${p.margin ?? "-"}% · ROAS ${p.roas ?? "-"}` : undefined} tone={p && p.opProfit < 0 ? "owner" : "ok"} />
        <Tile href="/receivables" label="받을 돈 · 7일 내" value={c ? krw(c.recv7) : NA}
          sub={c ? `연체 ${c.recvOverdueN}건 ${krw(c.recvOverdue)} · 전체 ${krw(c.recvOpen)}` : undefined} tone={c && c.recvOverdue > 0 ? "owner" : undefined} />
        <Tile href="/payables" label="줄 돈 · 7일 내" value={c ? krw(c.pay7) : NA}
          sub={c ? `7일 순현금 ${krw(net7)}${c.payOverdue > 0 ? ` · 지연 ${krw(c.payOverdue)}` : ""}` : undefined} tone={c && net7 < 0 ? "owner" : undefined} />
        <Tile href="/inventory" label="재고 위험" value={s.stock ? `${s.stock.total}품목` : NA}
          sub={s.stock?.risky.length ? s.stock.risky.slice(0, 2).map((r) => `${r.item} ${r.days}일`).join(" · ") : s.stock ? "리드타임 안쪽 품목 없음" : undefined} tone={s.stock?.total ? "owner" : "ok"} />
        <Tile href="/mudangtea" label="무당티 유통기한" value={s.expiry ? `${s.expiry.soon}로트` : NA} sub="90일 이내 임박" tone={s.expiry?.soon ? "warn" : undefined} />
        <Tile href="/e-approval" label="결재 대기" value={s.approvals === null ? NA : `${s.approvals}건`} tone={s.approvals ? "warn" : undefined} />
        <Tile href="/todos" label="업무" value={s.todos ? `지연 ${s.todos.overdue}` : NA} sub={s.todos ? `오늘 마감 ${s.todos.dueToday}건` : undefined} tone={s.todos?.overdue ? "owner" : undefined} />
        <Tile href="/agent-routines#review" label="AI 결과 검토" value={s.ai ? `${s.ai.review}건` : NA} sub={s.ai ? (s.ai.failed ? `실패 ${s.ai.failed}건` : "실패 없음") : "0100 마이그레이션 필요"} tone={s.ai?.failed ? "owner" : s.ai?.review ? "warn" : undefined} />
        <Tile href="/data-import" label="CS 미처리" value={s.cs ? `${s.cs.open}건` : NA} sub={s.cs ? `배송 지연·반품 7일 ${s.cs.delayed}건` : "데이터 입력 필요"} tone={s.cs?.open ? "warn" : undefined} />
      </div>

      {!compact && s.stock && s.stock.risky.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13.5 }}>발주가 필요한 품목 (재고 일수 &lt; 리드타임+안전여유)</div>
          {s.stock.risky.map((r) => (
            <div key={r.item} style={{ fontSize: 12.5, padding: "4px 0", borderTop: "1px solid var(--line)" }}>
              {r.item} · 재고 <b style={{ color: "var(--owner)" }}>{r.days}일</b> / 필요 {r.need}일
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
