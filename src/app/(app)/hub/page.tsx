import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { computeLedger, type LeaveMember, type LeaveUsage } from "@/lib/leave";

export const dynamic = "force-dynamic";

const won = (n: number) => (n ? n.toLocaleString("ko-KR") + "원" : "0원");

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  const svc = createSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const year = Number(today.slice(0, 4));

  // 미수금
  const recv = await safe(async () => {
    const { data } = await svc.from("receivables").select("billed,received,due_date");
    const rows = data ?? [];
    let out = 0, overdue = 0, overdueN = 0;
    for (const r of rows) {
      const o = (Number(r.billed) || 0) - (Number(r.received) || 0);
      if (o > 0) { out += o; if (r.due_date && r.due_date < today) { overdue += o; overdueN++; } }
    }
    return { out, overdue, overdueN };
  }, null);

  // 미지급금
  const pay = await safe(async () => {
    const { data } = await svc.from("payables").select("amount,paid,due_date");
    const rows = data ?? [];
    let out = 0, overdue = 0, overdueN = 0;
    for (const r of rows) {
      const o = (Number(r.amount) || 0) - (Number(r.paid) || 0);
      if (o > 0) { out += o; if (r.due_date && r.due_date < today) { overdue += o; overdueN++; } }
    }
    return { out, overdue, overdueN };
  }, null);

  // 승인 대기
  const pendingApprovals = await safe(async () => {
    const { count } = await svc.from("ai_outputs").select("*", { head: true, count: "exact" }).eq("approval_status", "pending");
    return count ?? 0;
  }, null);

  // 이번 달 미팅 + 최근
  const meetings = await safe(async () => {
    const { data: recent } = await svc.from("meetings").select("id,title,meeting_type,meeting_date").order("meeting_date", { ascending: false, nullsFirst: false }).limit(4);
    const { count } = await svc.from("meetings").select("*", { head: true, count: "exact" }).gte("meeting_date", `${month}-01`).lte("meeting_date", `${month}-31`);
    return { recent: recent ?? [], monthCount: count ?? 0 };
  }, null);

  // 오늘 업무일지
  const logToday = await safe(async () => {
    const { count } = await svc.from("manager_logs").select("*", { head: true, count: "exact" }).eq("log_date", today);
    return count ?? 0;
  }, null);

  // 연차 잔여 임박(<=3일)
  const leaveLow = await safe(async () => {
    const { data: m } = await svc.from("leave_members").select("id,name,join_date,carryover,note").eq("active", true);
    const { data: u } = await svc.from("leave_usages").select("id,member_id,use_date,type").gte("use_date", `${year}-01-01`).lte("use_date", `${year}-12-31`);
    const ledger = computeLedger((m ?? []) as LeaveMember[], (u ?? []) as LeaveUsage[], year, today);
    return ledger.filter((r) => r.remaining <= 3).map((r) => ({ name: r.name, remaining: r.remaining }));
  }, null);

  return (
    <div>
      <div className="page-head">
        <h1 style={{ margin: 0 }}>🏠 운영 현황</h1>
        <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>오늘 챙겨야 할 것들을 한눈에. ({today})</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <StatCard
          href="/receivables"
          title="🧾 미수금 (받을 돈)"
          value={recv ? won(recv.out) : "설정 필요"}
          sub={recv ? (recv.overdue ? `연체 ${recv.overdueN}건 · ${won(recv.overdue)}` : "연체 없음") : "미설정"}
          danger={!!recv?.overdue}
        />
        <StatCard
          href="/payables"
          title="💳 미지급금 (줄 돈)"
          value={pay ? won(pay.out) : "설정 필요"}
          sub={pay ? (pay.overdue ? `연체 ${pay.overdueN}건 · ${won(pay.overdue)}` : "연체 없음") : "미설정"}
          danger={!!pay?.overdue}
        />
        <StatCard
          href="/approvals"
          title="✅ 승인 대기"
          value={pendingApprovals === null ? "-" : `${pendingApprovals}건`}
          sub={pendingApprovals ? "확인이 필요합니다" : "밀린 승인 없음"}
          danger={!!pendingApprovals}
        />
        <StatCard
          href="/meetings"
          title="📝 이번 달 미팅"
          value={meetings ? `${meetings.monthCount}건` : "설정 필요"}
          sub={meetings?.recent[0] ? `최근: ${meetings.recent[0].title}` : "기록 없음"}
        />
        <StatCard
          href="/manager-log"
          title="📓 오늘 업무일지"
          value={logToday === null ? "설정 필요" : `${logToday}건`}
          sub={logToday ? "작성됨" : "오늘 기록 없음"}
          danger={logToday === 0}
        />
        <StatCard
          href="/leave"
          title="🌴 연차 잔여 임박"
          value={leaveLow ? `${leaveLow.length}명` : "설정 필요"}
          sub={leaveLow && leaveLow.length ? leaveLow.slice(0, 2).map((x) => `${x.name} ${x.remaining}일`).join(" · ") : "여유 있음"}
          danger={!!leaveLow?.length}
        />
      </div>

      {meetings && meetings.recent.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 22 }}>최근 미팅</div>
          <div className="card" style={{ padding: 0 }}>
            {meetings.recent.map((m: any, i: number) => (
              <Link key={m.id} href="/meetings" style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "11px 14px", borderTop: i ? "1px solid var(--line)" : "none", textDecoration: "none", color: "var(--ink)" }}>
                <span><b style={{ fontSize: 12, color: m.meeting_type === "외부" ? "#b45309" : "var(--accent)" }}>{m.meeting_type}</b> {m.title}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{m.meeting_date || "-"}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        ‘설정 필요’로 뜨는 항목은 <Link href="/settings" style={{ color: "var(--accent)" }}>설정 → DB 설정 센터</Link>에서 SQL을 한 번 실행하면 채워집니다.
      </p>
    </div>
  );
}

function StatCard({ href, title, value, sub, danger }: { href: string; title: string; value: string; sub: string; danger?: boolean }) {
  return (
    <Link href={href} className="card" style={{ padding: 16, textDecoration: "none", color: "var(--ink)", display: "block" }}>
      <div className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 2px", color: danger ? "var(--owner, #b91c1c)" : "var(--ink)" }}>{value}</div>
      <div style={{ fontSize: 12, color: danger ? "var(--owner, #b91c1c)" : "var(--ink-2)" }}>{sub}</div>
    </Link>
  );
}
