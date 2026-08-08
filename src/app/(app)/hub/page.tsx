import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import DailyChecklist from "@/components/DailyChecklist";
import FolderCards from "@/components/FolderCards";
import { FOLDER_GROUPS } from "@/lib/folders";
import { fetchPnlRows, extractMonthlyPnl } from "@/lib/pnl";
import { isCeoUser } from "@/lib/ceo";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // P&L 시트 조회 여유

const won = (n: number) => (n ? n.toLocaleString("ko-KR") + "원" : "0원");
const wonOrSet = (n: number | null) => (n == null ? "설정 필요" : Math.round(n).toLocaleString("ko-KR") + "원");

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
  const isOwner = user.role === "owner";

  const svc = createSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const cnt = (q: PromiseLike<{ count: number | null }>): Promise<number> =>
    safe(() => Promise.resolve(q).then((r) => r.count ?? 0), 0);
  const t = (name: string) => svc.from(name).select("id", { count: "exact", head: true });

  const [
    checks,
    pendingApprovals,
    pnl,
    recvBal,
    payBal,
    resultCount,
    todoCount,
    ceoCount,
    planCount,
    meetCount,
    mlogCount,
    leaveCount,
    recvCount,
    payCount,
    crmCount,
    poCount,
    invCount,
    pdevCount,
    eapprCount,
  ] = await Promise.all([
    safe(async () => {
      const { data } = await svc.from("daily_checks").select("item_key,done").eq("check_date", today);
      const m: Record<string, boolean> = {};
      (data ?? []).forEach((r: { item_key: string; done: boolean }) => { m[r.item_key] = !!r.done; });
      return m;
    }, {} as Record<string, boolean>),
    cnt(
      svc.from("ai_outputs").select("id", { count: "exact", head: true })
        .eq("agent_type", "marketer").in("compliance_status", ["pass", "fail"]).eq("approval_status", "pending")
    ),
    // P&L 시트에서 매출·매입(원가) — 매출이 있는 최근 기간 기준.
    safe(async () => {
      const sheet = await fetchPnlRows();
      if (!sheet.ok || !sheet.rows) return null;
      const m = extractMonthlyPnl(sheet.rows);
      if (!m) return null;
      const i = m.latestIdx;
      const val = (key: string) => m.lines.find((l) => l.key === key)?.values[i] ?? null;
      const revenue = val("revenue");
      const gp = val("gross_profit");
      const cogs = revenue != null && gp != null ? revenue - gp : null;
      return { period: m.periods[i] ?? "", revenue, cogs };
    }, null as { period: string; revenue: number | null; cogs: number | null } | null),
    // 미수금 잔액
    safe(async () => {
      const { data } = await svc.from("receivables").select("billed, received");
      return ((data ?? []) as { billed: number | null; received: number | null }[]).reduce((s, r) => s + Math.max(0, (Number(r.billed) || 0) - (Number(r.received) || 0)), 0);
    }, 0),
    // 미지급 잔액
    safe(async () => {
      const { data } = await svc.from("payables").select("amount, paid");
      return ((data ?? []) as { amount: number | null; paid: number | null }[]).reduce((s, r) => s + Math.max(0, (Number(r.amount) || 0) - (Number(r.paid) || 0)), 0);
    }, 0),
    cnt(t("tasks").eq("ai_agent_type", "marketer").eq("status", "완료")),
    cnt(t("todos").in("status", ["예정", "진행"])),
    cnt(t("ceo_todos").eq("done", false)),
    cnt(t("ai_outputs").in("agent_type", ["md", "designer"]).eq("approval_status", "pending")),
    cnt(t("meetings")),
    cnt(t("manager_logs")),
    cnt(t("leave_usages")),
    cnt(t("receivables").is("settled_at", null)),
    cnt(t("payables").is("settled_at", null)),
    cnt(t("crm_leads")),
    cnt(t("purchase_orders")),
    cnt(t("inventory_items")),
    cnt(t("product_developments")),
    cnt(t("approval_requests").eq("status", "pending")),
  ]);

  const counts: Record<string, number> = {
    "/dashboard": resultCount,
    "/todos": todoCount,
    "/ceo-todos": ceoCount,
    "/planning": planCount,
    "/meetings": meetCount,
    "/manager-log": mlogCount,
    "/leave": leaveCount,
    "/receivables": recvCount,
    "/payables": payCount,
    "/crm": crmCount,
    "/vendors": poCount,
    "/inventory": invCount,
    "/product-dev": pdevCount,
    "/e-approval": eapprCount,
  };

  const hourKst = (new Date().getUTCHours() + 9) % 24;
  const greet =
    hourKst < 6 ? "늦은 밤까지 고생 많으세요" :
    hourKst < 11 ? "좋은 아침이에요" :
    hourKst < 14 ? "점심 전 마무리해요" :
    hourKst < 18 ? "좋은 오후예요" :
    hourKst < 22 ? "좋은 저녁이에요" : "오늘도 고생 많으셨어요";
  const focusLine = pendingApprovals ? `승인 대기 ${pendingApprovals}건` : "오늘 급한 알림은 없어요 👍";

  const isCeo = isCeoUser(user);
  const groups = FOLDER_GROUPS.map((g) => ({
    title: g.title,
    items: g.items.filter((it) => it.href !== "/hub" && (!it.owner || isOwner) && (!it.ceo || isCeo)),
  })).filter((g) => g.items.length > 0);

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
          marginBottom: 14,
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

      {/* 재무 요약(작게) — 매출·매입은 P&L 시트 기준 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
        <MiniStat title={`📈 매출 (P&L${pnl?.period ? " · " + pnl.period : ""})`} value={wonOrSet(pnl?.revenue ?? null)} href="/pnl" />
        <MiniStat title={`📉 매입·원가 (P&L${pnl?.period ? " · " + pnl.period : ""})`} value={wonOrSet(pnl?.cogs ?? null)} href="/pnl" />
        <MiniStat title="🧾 미수금 잔액" value={won(recvBal)} href="/receivables" />
        <MiniStat title="💳 미지급 잔액" value={won(payBal)} href="/payables" danger={payBal > 0} />
      </div>

      {/* 일일 체크리스트 (유지) */}
      <DailyChecklist today={today} initialDone={checks} />

      {/* 전체 폴더 — 카테고리별 카드 + 빨간 알림 배지 */}
      <div className="section-title" style={{ marginTop: 24 }}>전체 폴더</div>
      <FolderCards groups={groups} counts={counts} pendingCount={pendingApprovals} />
    </div>
  );
}

function MiniStat({ title, value, href, danger }: { title: string; value: string; href: string; danger?: boolean }) {
  return (
    <Link href={href} className="card folder-card" style={{ padding: "12px 14px", textDecoration: "none", color: "var(--ink)", display: "block" }}>
      <div className="muted" style={{ fontSize: 11.5, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4, color: danger ? "var(--owner, #b91c1c)" : "var(--ink)" }}>{value}</div>
    </Link>
  );
}
