import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { computeLedger, type LeaveMember, type LeaveUsage } from "@/lib/leave";
import DailyChecklist from "@/components/DailyChecklist";

export const dynamic = "force-dynamic";

const won = (n: number) => (n ? n.toLocaleString("ko-KR") + "원" : "0원");
const md = (d: string) => (d ? d.slice(5).replace("-", "/") : "-");

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

type Line = { c: string; a: number; d: string };

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  const svc = createSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const year = Number(today.slice(0, 4));
  const [Y, M, D] = today.split("-").map(Number);

  // 이번 주(월~일) 범위
  const base = new Date(Date.UTC(Y, M - 1, D));
  const offset = (base.getUTCDay() + 6) % 7;
  const ws = new Date(base); ws.setUTCDate(base.getUTCDate() - offset);
  const we = new Date(ws); we.setUTCDate(ws.getUTCDate() + 6);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const weekStart = iso(ws), weekEnd = iso(we);
  const daysInMonth = new Date(Date.UTC(Y, M, 0)).getUTCDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const inR = (d: string, a: string, b: string) => !!d && d >= a && d <= b;

  // ── 모든 조회를 병렬로 (순차 대비 대폭 빠름) ──
  const [checks, payRows, recvRows, pendingApprovals, meetingCount, logToday, leaveData] = await Promise.all([
    safe(async () => {
      const { data } = await svc.from("daily_checks").select("item_key,done").eq("check_date", today);
      const m: Record<string, boolean> = {};
      (data ?? []).forEach((r: any) => { m[r.item_key] = !!r.done; });
      return m;
    }, {} as Record<string, boolean>),
    safe(async () => {
      let res: any = await svc.from("payables").select("counterparty,amount,paid,due_date,frequency,period_amount,has_end,end_date");
      if (res.error) res = await svc.from("payables").select("counterparty,amount,paid,due_date");
      return res.data ?? [];
    }, [] as any[]),
    safe(async () => (await svc.from("receivables").select("counterparty,billed,received,due_date")).data ?? [], [] as any[]),
    safe(async () => (await svc.from("ai_outputs").select("*", { head: true, count: "exact" }).eq("approval_status", "pending")).count ?? 0, null as number | null),
    safe(async () => (await svc.from("meetings").select("*", { head: true, count: "exact" }).gte("meeting_date", monthStart).lte("meeting_date", monthEnd)).count ?? 0, null as number | null),
    safe(async () => (await svc.from("manager_logs").select("*", { head: true, count: "exact" }).eq("log_date", today)).count ?? 0, null as number | null),
    safe(async () => {
      const [m, u] = await Promise.all([
        svc.from("leave_members").select("id,name,join_date,carryover,note").eq("active", true),
        svc.from("leave_usages").select("id,member_id,use_date,type").gte("use_date", `${year}-01-01`).lte("use_date", `${year}-12-31`),
      ]);
      return { members: (m.data ?? []) as LeaveMember[], usages: (u.data ?? []) as LeaveUsage[] };
    }, null as { members: LeaveMember[]; usages: LeaveUsage[] } | null),
  ]);

  let weekOut = 0, monthOut = 0, recurring = false;
  const weekOutList: Line[] = [], monthOutList: Line[] = [];
  for (const r of payRows) {
    const freq = r.frequency || "없음";
    const period = Number(r.period_amount) || 0;
    if (freq !== "없음") {
      recurring = true;
      const endsBeforeWeek = r.has_end && r.end_date && r.end_date < weekStart;
      const endsBeforeMonth = r.has_end && r.end_date && r.end_date < monthStart;
      if (!endsBeforeWeek) {
        if (freq === "매일") weekOut += period * 7;
        else if (freq === "매주") weekOut += period;
      }
      if (!endsBeforeMonth) {
        if (freq === "매일") monthOut += period * daysInMonth;
        else if (freq === "매주") monthOut += period * 4;
        else if (freq === "매월") monthOut += period;
      }
    } else {
      const out = (Number(r.amount) || 0) - (Number(r.paid) || 0);
      if (out > 0 && r.due_date) {
        if (inR(r.due_date, weekStart, weekEnd)) { weekOut += out; weekOutList.push({ c: r.counterparty, a: out, d: r.due_date }); }
        if (inR(r.due_date, monthStart, monthEnd)) { monthOut += out; monthOutList.push({ c: r.counterparty, a: out, d: r.due_date }); }
      }
    }
  }

  // 미수금(이번 달 들어올 돈) — 이미 받아온 recvRows로 계산
  let monthIn = 0;
  const monthInList: Line[] = [];
  for (const r of recvRows) {
    const out = (Number(r.billed) || 0) - (Number(r.received) || 0);
    if (out > 0 && r.due_date && inR(r.due_date, monthStart, monthEnd)) {
      monthIn += out; monthInList.push({ c: r.counterparty, a: out, d: r.due_date });
    }
  }
  const sortByDate = (a: Line, b: Line) => (a.d < b.d ? -1 : 1);
  weekOutList.sort(sortByDate); monthOutList.sort(sortByDate); monthInList.sort(sortByDate);

  // 잔액 요약 — 중복 조회 없이 위 배열들로 계산
  const recvBal = recvRows.length || monthIn ? (() => {
    let out = 0, overdue = 0;
    for (const r of recvRows) { const o = (Number(r.billed) || 0) - (Number(r.received) || 0); if (o > 0) { out += o; if (r.due_date && r.due_date < today) overdue += o; } }
    return { out, overdue };
  })() : { out: 0, overdue: 0 };
  const payBal = (() => {
    let out = 0, overdue = 0;
    for (const r of payRows) { const o = (Number(r.amount) || 0) - (Number(r.paid) || 0); if (o > 0) { out += o; if (r.due_date && r.due_date < today) overdue += o; } }
    return { out, overdue };
  })();
  const leaveLow = leaveData ? computeLedger(leaveData.members, leaveData.usages, year, today).filter((r) => r.remaining <= 3).length : null;

  const hourKst = (new Date().getUTCHours() + 9) % 24;
  const greet =
    hourKst < 6 ? "늦은 밤까지 고생 많으세요" :
    hourKst < 11 ? "좋은 아침이에요" :
    hourKst < 14 ? "점심 전 마무리해요" :
    hourKst < 18 ? "좋은 오후예요" :
    hourKst < 22 ? "좋은 저녁이에요" : "오늘도 고생 많으셨어요";
  const focus: string[] = [];
  if (pendingApprovals) focus.push(`승인 대기 ${pendingApprovals}건`);
  if (payBal?.overdue) focus.push("미지급 연체");
  if (recvBal?.overdue) focus.push("미수금 연체");
  if (logToday === 0) focus.push("오늘 업무일지 미작성");
  const focusLine = focus.length ? focus.join(" · ") : "오늘 급한 알림은 없어요 👍";

  return (
    <div>
      {/* 히어로 인사 */}
      <div
        className="card"
        style={{
          background: "linear-gradient(120deg, var(--accent-bg), var(--surface))",
          borderColor: "var(--line)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {user.name} 님, {greet} 👋
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            🗓 {today} · {focusLine}
          </div>
        </div>
        <Link href={pendingApprovals ? "/approvals" : "/todos"} className="btn primary" style={{ textDecoration: "none", flexShrink: 0 }}>
          {pendingApprovals ? `승인 ${pendingApprovals}건 처리 →` : "오늘 할 일 보기 →"}
        </Link>
      </div>

      {/* 체크리스트 */}
      <DailyChecklist today={today} initialDone={checks} />

      {/* 자금 흐름 */}
      <div className="section-title" style={{ marginTop: 22 }}>이번 주·달 자금</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <CashCard href="/payables" title="💳 이번 주 나갈 돈" total={weekOut} sub={`${weekStart.slice(5)}~${weekEnd.slice(5)}${recurring ? " · 정기 추정 포함" : ""}`} lines={weekOutList} danger />
        <CashCard href="/payables" title="💳 이번 달 나갈 돈" total={monthOut} sub={`${month} 전체${recurring ? " · 정기 추정 포함" : ""}`} lines={monthOutList} danger />
        <CashCard href="/receivables" title="🧾 이번 달 들어올 돈" total={monthIn} sub={`${month} 입금 예정`} lines={monthInList} />
      </div>

      {/* 요약 스탯 */}
      <div className="section-title" style={{ marginTop: 22 }}>잔액·업무 요약</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Stat href="/receivables" title="🧾 미수금 잔액" value={recvBal ? won(recvBal.out) : "설정 필요"} sub={recvBal?.overdue ? `연체 ${won(recvBal.overdue)}` : "연체 없음"} danger={!!recvBal?.overdue} />
        <Stat href="/payables" title="💳 미지급 잔액" value={payBal ? won(payBal.out) : "설정 필요"} sub={payBal?.overdue ? `연체 ${won(payBal.overdue)}` : "연체 없음"} danger={!!payBal?.overdue} />
        <Stat href="/approvals" title="✅ 승인 대기" value={pendingApprovals === null ? "-" : `${pendingApprovals}건`} sub={pendingApprovals ? "확인 필요" : "없음"} danger={!!pendingApprovals} />
        <Stat href="/meetings" title="📝 이번 달 미팅" value={meetingCount === null ? "설정 필요" : `${meetingCount}건`} sub="미팅·회의 일지" />
        <Stat href="/manager-log" title="📓 오늘 업무일지" value={logToday === null ? "설정 필요" : `${logToday}건`} sub={logToday ? "작성됨" : "오늘 기록 없음"} danger={logToday === 0} />
        <Stat href="/leave" title="🌴 연차 임박" value={leaveLow === null ? "설정 필요" : `${leaveLow}명`} sub={leaveLow ? "잔여 3일 이하" : "여유 있음"} danger={!!leaveLow} />
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        ‘설정 필요’ 항목은 <Link href="/settings" style={{ color: "var(--accent)" }}>설정 → DB 설정 센터</Link>에서 SQL을 한 번 실행하면 채워집니다.
      </p>
    </div>
  );
}

function CashCard({ href, title, total, sub, lines, danger }: { href: string; title: string; total: number; sub: string; lines: Line[]; danger?: boolean }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 2px", color: danger ? "var(--owner, #b91c1c)" : "var(--ink)" }}>{won(total)}</div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>{sub}</div>
      {lines.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {lines.slice(0, 6).map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
              <span style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{md(l.d)} · {l.c}</span>
              <span style={{ fontWeight: 600 }}>{won(l.a)}</span>
            </div>
          ))}
          {lines.length > 6 && <span className="muted" style={{ fontSize: 11 }}>외 {lines.length - 6}건</span>}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>예정 없음</div>
      )}
      <Link href={href} style={{ fontSize: 11.5, color: "var(--accent)", textDecoration: "none", display: "inline-block", marginTop: 8 }}>자세히 ↗</Link>
    </div>
  );
}

function Stat({ href, title, value, sub, danger }: { href: string; title: string; value: string; sub: string; danger?: boolean }) {
  return (
    <Link href={href} className="card" style={{ padding: 16, textDecoration: "none", color: "var(--ink)", display: "block" }}>
      <div className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, margin: "6px 0 2px", color: danger ? "var(--owner, #b91c1c)" : "var(--ink)" }}>{value}</div>
      <div style={{ fontSize: 12, color: danger ? "var(--owner, #b91c1c)" : "var(--ink-2)" }}>{sub}</div>
    </Link>
  );
}
