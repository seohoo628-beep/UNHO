import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import DailyChecklist from "@/components/DailyChecklist";
import FolderCards from "@/components/FolderCards";
import GlobalRestoreButton from "@/components/GlobalRestoreButton";
import PomodoroMini from "@/components/PomodoroMini";
import { FOLDER_GROUPS } from "@/lib/folders";
import { fetchPnlRows, extractMonthlyPnl } from "@/lib/pnl";
import { seoulToday } from "@/lib/time";
import { isCeoUser } from "@/lib/ceo";
import { canViewFinance } from "@/lib/finance";
import { getRevenueGoals } from "@/app/(app)/commerce-framework/actions";
import { ALL_KEYS, LABEL_BY_KEY, type SmartItem, type CustomDailyItem, type WeeklyReport, type MonthlyReport } from "@/lib/dailyChecklist";
import { normalizePrefs, type UserPrefs } from "@/lib/userPrefs";

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
  if (user.role === "guest") redirect("/partner");
  const isOwner = user.role === "owner";

  const svc = createSupabaseServiceClient();
  const today = seoulToday();

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
    "/work-logs": mlogCount,
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
  const isFinance = canViewFinance(user);

  // 마감 임박(3일 내)·지연 업무. CEO 투두는 대표에게만, 업무투두는 전원.
  const soonStr = new Date(Date.now() + 3 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  type DueItem = { id: string; text: string; due: string; kind: string; href: string };
  const dueItems = await safe(async () => {
    const qs: PromiseLike<{ data: any[] | null }>[] = [
      svc.from("todos").select("id,title,due_date").in("status", ["예정", "진행", "보류"]).not("due_date", "is", null).lte("due_date", soonStr).order("due_date", { ascending: true }).limit(30),
    ];
    if (isCeo) qs.unshift(svc.from("ceo_todos").select("id,text,due_date").eq("done", false).not("due_date", "is", null).lte("due_date", soonStr).order("due_date", { ascending: true }).limit(30));
    const res = await Promise.all(qs);
    const staff = res[isCeo ? 1 : 0]?.data ?? [];
    const ceo = isCeo ? (res[0]?.data ?? []) : [];
    const rows: DueItem[] = [
      ...ceo.map((r: any) => ({ id: r.id, text: r.text ?? "", due: r.due_date, kind: "CEO 투두", href: "/ceo-todos" })),
      ...staff.map((r: any) => ({ id: r.id, text: r.title ?? "", due: r.due_date, kind: "업무투두", href: "/todos" })),
    ];
    return rows.sort((a, b) => a.due.localeCompare(b.due));
  }, [] as DueItem[]);

  // 체크리스트(하위 항목) 마감일도 함께 수집 — 임박/지연 D-day로 노출.
  const ckDue = await safe(async () => {
    const isDue = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const scan = (parents: any[] | null, kind: string, href: string): DueItem[] => {
      const out: DueItem[] = [];
      for (const p of parents ?? []) {
        const list = Array.isArray(p.checklist) ? p.checklist : [];
        for (const c of list) {
          if (c?.done || !isDue(c?.due) || c.due > soonStr) continue;
          const parentText = String(p.text ?? p.title ?? "").trim();
          const itemText = String(c?.text ?? "").trim();
          out.push({ id: `${p.id}:${c.id}`, text: parentText ? `${parentText} › ${itemText}` : itemText, due: c.due, kind, href });
        }
      }
      return out;
    };
    const qs: PromiseLike<{ data: any[] | null }>[] = [svc.from("todos").select("id,title,checklist").limit(400)];
    if (isCeo) { qs.push(svc.from("ceo_todos").select("id,text,checklist").limit(400)); qs.push(svc.from("reminders").select("id,text,checklist").limit(400)); }
    const r = await Promise.all(qs);
    let rows = scan(r[0]?.data ?? null, "업무투두 체크", "/todos");
    if (isCeo) { rows = rows.concat(scan(r[1]?.data ?? null, "CEO투두 체크", "/ceo-todos")); rows = rows.concat(scan(r[2]?.data ?? null, "리마인드 체크", "/reminders")); }
    return rows;
  }, [] as DueItem[]);

  const allDue = [...dueItems, ...ckDue].sort((a, b) => a.due.localeCompare(b.due));
  const overdue = allDue.filter((d) => d.due < today);
  const dueSoon = allDue.filter((d) => d.due >= today);

  // 스마트 항목(#1): 실데이터 기반 오늘 할 일. count>0인 것만.
  const smartItems: SmartItem[] = [
    { key: "sm_due", label: "오늘·지연 마감 업무 처리", href: "/todos", count: overdue.length + dueSoon.length },
    { key: "sm_appr", label: "승인 대기 콘텐츠 검토", href: "/approvals", count: pendingApprovals },
    ...(isCeo ? [{ key: "sm_ceo", label: "CEO 미완료 투두 정리", href: "/ceo-todos", count: ceoCount }] : []),
    ...(isFinance && recvBal > 0 ? [{ key: "sm_recv", label: "미수금 회수 점검", href: "/receivables", count: 1 }] : []),
  ].filter((s) => s.count > 0);

  // 연속 달성 스트릭(#5): 최근 40일 중 오늘부터 거꾸로 '전체 완료'가 이어진 일수.
  const streak = await safe(async () => {
    const cutoff = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
    const { data } = await svc.from("daily_checks").select("check_date").eq("done", true).gte("check_date", cutoff);
    const cnt: Record<string, number> = {};
    for (const r of (data ?? []) as { check_date: string }[]) cnt[r.check_date] = (cnt[r.check_date] || 0) + 1;
    const need = ALL_KEYS.length;
    const dayStr = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    const base = new Date(today + "T12:00:00+09:00");
    if ((cnt[today] || 0) < need) base.setDate(base.getDate() - 1); // 오늘 미완료면 어제부터
    let s = 0;
    for (let i = 0; i < 40; i++) { const ds = dayStr(base); if ((cnt[ds] || 0) >= need) { s++; base.setDate(base.getDate() - 1); } else break; }
    return s;
  }, 0);
  // 사용자 정의 체크리스트 항목. 본인이 만든 것 + 나에게 배정된 공용 항목까지 보이게.
  const customItems = await safe<CustomDailyItem[]>(async () => {
    const sel = "id,group_name,label,href,note,weekdays,assignee,created_by";
    let res: { data: any[] | null; error: { message?: string } | null } =
      await svc.from("daily_checklist_items").select(sel).eq("active", true).order("sort_order", { ascending: true });
    if (res.error && /assignee/.test(res.error.message ?? "")) {
      res = await svc.from("daily_checklist_items").select("id,group_name,label,href,note,weekdays,created_by").eq("active", true).order("sort_order", { ascending: true });
    }
    const rows = (res.data ?? []) as any[];
    // 본인이 만든 항목 또는 담당자가 본인/미지정인 항목만 노출.
    return rows
      .filter((r) => r.created_by === user.id || !r.assignee || r.assignee === user.name)
      .map((r) => ({
        id: r.id, group: r.group_name ?? "내 항목", label: r.label ?? "",
        href: r.href ?? undefined, note: r.note ?? undefined,
        weekdays: Array.isArray(r.weekdays) ? r.weekdays : undefined,
        assignee: r.assignee ?? undefined,
      }));
  }, []);
  // 담당자 선택용 구성원 이름(owner/staff).
  const members = await safe<string[]>(async () => {
    const { data } = await svc.from("users").select("name").in("role", ["owner", "staff"]).eq("active", true).order("name");
    return [...new Set(((data ?? []) as { name: string | null }[]).map((r) => r.name).filter((n): n is string => !!n))];
  }, []);
  // 오늘 요일(0=일…6=토, 서울 기준).
  const todayDow = new Date(today + "T12:00:00+09:00").getDay();

  // 개인별 맞춤 설정(계정 단위).
  const prefs = await safe<UserPrefs>(async () => {
    const { data } = await svc.from("user_prefs").select("prefs").eq("user_id", user.id).maybeSingle();
    return normalizePrefs(data?.prefs);
  }, {});
  const hiddenDailyKeys = prefs.hiddenDailyKeys ?? [];
  const favFolders = prefs.favFolders ?? [];
  const hiddenFolders = prefs.hiddenFolders ?? [];
  const folderOrder = prefs.folderOrder ?? [];
  const folderGroupsMap = prefs.folderGroups ?? {};

  // 주간 리포트(#8): 최근 7일 완료 추이 + 자주 놓친 항목.
  const weekly = await safe<WeeklyReport | null>(async () => {
    const dow = ["일", "월", "화", "수", "목", "금", "토"];
    const days: { date: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today + "T12:00:00+09:00");
      d.setDate(d.getDate() - i);
      const ds = d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
      days.push({ date: ds, label: dow[d.getDay()] });
    }
    const startDate = days[0].date;
    const { data } = await svc.from("daily_checks").select("check_date,item_key,done").gte("check_date", startDate).lte("check_date", today).eq("done", true);
    const byDay: Record<string, number> = {};
    const byItem: Record<string, number> = {};
    for (const r of (data ?? []) as { check_date: string; item_key: string }[]) {
      byDay[r.check_date] = (byDay[r.check_date] || 0) + 1;
      if (ALL_KEYS.includes(r.item_key)) byItem[r.item_key] = (byItem[r.item_key] || 0) + 1;
    }
    const need = ALL_KEYS.length || 1;
    const dayStats = days.map((d) => {
      const done = byDay[d.date] || 0;
      return { date: d.date, label: d.label, done, pct: Math.min(100, Math.round((done / need) * 100)) };
    });
    const avgPct = Math.round(dayStats.reduce((s, d) => s + d.pct, 0) / dayStats.length);
    const missed = ALL_KEYS
      .map((k) => ({ key: k, label: LABEL_BY_KEY[k] ?? k, done: byItem[k] || 0 }))
      .filter((m) => m.done < 5) // 최근 7일 중 5회 미만 수행
      .sort((a, b) => a.done - b.done)
      .slice(0, 5);
    return { dayStats, missed, need, avgPct };
  }, null);

  // 월간 리포트(#4): 최근 30일 일별 완료율 + CSV 내보내기용.
  const monthly = await safe<MonthlyReport | null>(async () => {
    const N = 30;
    const dow = ["일", "월", "화", "수", "목", "금", "토"];
    const days: { date: string; label: string }[] = [];
    for (let i = N - 1; i >= 0; i--) {
      const d = new Date(today + "T12:00:00+09:00");
      d.setDate(d.getDate() - i);
      const ds = d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
      days.push({ date: ds, label: dow[d.getDay()] });
    }
    const { data } = await svc.from("daily_checks").select("check_date").gte("check_date", days[0].date).lte("check_date", today).eq("done", true);
    const byDay: Record<string, number> = {};
    for (const r of (data ?? []) as { check_date: string }[]) byDay[r.check_date] = (byDay[r.check_date] || 0) + 1;
    const need = ALL_KEYS.length || 1;
    const dayStats = days.map((d) => {
      const done = byDay[d.date] || 0;
      return { date: d.date, label: d.label, done, pct: Math.min(100, Math.round((done / need) * 100)) };
    });
    const avgPct = Math.round(dayStats.reduce((s, d) => s + d.pct, 0) / dayStats.length);
    const perfectDays = dayStats.filter((d) => d.pct >= 100).length;
    return { dayStats, avgPct, perfectDays, need };
  }, null);

  // 브랜드 매출 목표(커머스 프레임에서 저장한 값) → 월 목표 요약.
  const goalsRes = await getRevenueGoals();
  const revenueGoals = (goalsRes.goals ?? []).filter((g) => g.annual > 0);
  const visible = (it: (typeof FOLDER_GROUPS)[number]["items"][number]) =>
    it.href !== "/hub" && (!it.owner || isOwner) && (!it.ceo || isCeo) && (!it.finance || isFinance);
  // CEO 전용(나만 보이는 🔒) 폴더를 별도 그룹으로 모아 맨 위에 둔다.
  const ceoItems: (typeof FOLDER_GROUPS)[number]["items"] = [];
  const normalGroups = FOLDER_GROUPS.map((g) => {
    const items = [] as typeof g.items;
    for (const it of g.items) {
      if (!visible(it)) continue;
      if (isCeo && it.ceo) ceoItems.push(it);
      else items.push(it);
    }
    return { title: g.title, items };
  }).filter((g) => g.items.length > 0);
  const groups = (ceoItems.length ? [{ title: "🔒 나만 보는 폴더", items: ceoItems }] : []).concat(normalGroups);

  return (
    <div>
      {/* 사업 슬로건 */}
      <div
        className="card"
        style={{
          padding: "12px 18px",
          marginBottom: 14,
          textAlign: "center",
          background: "linear-gradient(120deg, #e0f2fe, #bae6fd)",
          border: "1px solid #38bdf8",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#075985", marginBottom: 4 }}>
          사업 슬로건
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0c4a6e", letterSpacing: "-0.01em" }}>
          제품 × 채널(유입·체류) × 전환 × 재구매 초집중
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0369a1", marginTop: 4 }}>
          리뷰 + 구매건수 2000건 이상 기본세팅
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#b91c1c", marginTop: 4 }}>
          성과 = 매출. 매출이 없는 노력은 성과가 아니다.
        </div>
      </div>

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

      {/* 마감 임박·지연 알림 */}
      {(overdue.length > 0 || dueSoon.length > 0) && (
        <div className="card" style={{ marginBottom: 14, borderLeft: `4px solid ${overdue.length ? "var(--owner,#dc2626)" : "var(--warn,#f59e0b)"}` }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
            ⏰ 마감 알림 {overdue.length > 0 && <span style={{ color: "var(--owner,#dc2626)" }}>· 지연 {overdue.length}건</span>}{dueSoon.length > 0 && <span style={{ color: "var(--warn,#b45309)" }}> · 임박 {dueSoon.length}건</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[...overdue, ...dueSoon].slice(0, 6).map((d) => {
              const late = d.due < today;
              const dd = Math.round((new Date(d.due + "T00:00:00+09:00").getTime() - new Date(today + "T00:00:00+09:00").getTime()) / 86400000);
              const label = late ? `${-dd}일 지남` : dd === 0 ? "오늘" : `D-${dd}`;
              return (
                <Link key={d.href + d.id} href={d.href} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "var(--ink)", fontSize: 13 }}>
                  <span className="badge" style={{ fontSize: 11, flexShrink: 0, background: late ? "var(--owner-bg,#fdecea)" : "var(--warn-bg,#fdf3e2)", color: late ? "var(--owner,#b3261e)" : "var(--warn,#b26a00)" }}>{label}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{d.text}</span>
                  <span className="muted" style={{ fontSize: 11, flexShrink: 0 }}>{d.kind}</span>
                </Link>
              );
            })}
            {overdue.length + dueSoon.length > 6 && <div className="muted" style={{ fontSize: 12 }}>외 {overdue.length + dueSoon.length - 6}건…</div>}
          </div>
        </div>
      )}

      {/* 뽀모도로 집중 미니 위젯 */}
      <PomodoroMini />

      {/* 재무 요약(작게) — 매출·매입은 P&L 시트 기준 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
        <MiniStat title={`📈 매출 (P&L${pnl?.period ? " · " + pnl.period : ""})`} value={wonOrSet(pnl?.revenue ?? null)} href="/pnl" />
        <MiniStat title={`📉 매입·원가 (P&L${pnl?.period ? " · " + pnl.period : ""})`} value={wonOrSet(pnl?.cogs ?? null)} href="/pnl" />
        {isFinance && <MiniStat title="🧾 미수금 잔액" value={won(recvBal)} href="/receivables" />}
        {isFinance && <MiniStat title="💳 미지급 잔액" value={won(payBal)} href="/payables" danger={payBal > 0} />}
      </div>

      {/* 브랜드 월 매출 목표 (커머스 프레임 역산값) */}
      {revenueGoals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
          {revenueGoals.map((g) => (
            <MiniStat key={g.brand} title={`🎯 ${g.brand} 월 목표`} value={won(Math.round(g.annual / 12))} href="/commerce-framework" />
          ))}
        </div>
      )}

      {/* 일일 체크리스트 (유지) */}
      <DailyChecklist today={today} initialDone={checks} smartItems={smartItems} streak={streak} customItems={customItems} todayDow={todayDow} hiddenDailyKeys={hiddenDailyKeys} weekly={weekly} monthly={monthly} eveningNudge={hourKst >= 15} members={members} currentUserName={user.name ?? ""} />

      {/* 전체 폴더 — 카테고리별 카드 + 빨간 알림 배지 */}
      <div className="section-title" style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span>전체 폴더</span>
        {isCeo && <GlobalRestoreButton />}
      </div>
      <FolderCards groups={groups} counts={counts} pendingCount={pendingApprovals} initialFav={favFolders} initialHidden={hiddenFolders} initialOrder={folderOrder} initialGroups={folderGroupsMap} />
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
