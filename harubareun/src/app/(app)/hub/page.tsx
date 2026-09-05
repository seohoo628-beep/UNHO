import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import DailyChecklist from "@/components/DailyChecklist";
import AutoBackupTrigger from "@/components/AutoBackupTrigger";
import FolderCards from "@/components/FolderCards";
import GlobalRestore from "@/components/GlobalRestore";
import { listBackups, type BackupMeta } from "@/lib/backup";
import { FOLDER_GROUPS } from "@/lib/folders";
import { fetchPnlRows, extractMonthlyPnl } from "@/lib/pnl";
import { seoulToday } from "@/lib/time";
import { isCeoUser } from "@/lib/ceo";
import { tableMissing } from "@/lib/db";
import { isDueOn, shiftDate, detectRole, WEEKDAY_LABELS, type ChecklistItem, type DueItem } from "@/lib/checklist";
import type { ChecklistBundle } from "@/components/DailyChecklist";
import { getMyPrefs } from "@/app/(app)/hub/prefs-actions";

// 오늘의 체크리스트: 항목 템플릿 + 개인 완료 + 팀 완료 + 주간 달성률/streak.
async function loadChecklist(
  svc: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
  jobTitle: string | null,
  appRole: string,
  today: string
): Promise<ChecklistBundle> {
  const empty: ChecklistBundle = { ready: true, items: [], allItems: [], myRole: null, week: [], streak: 0 };
  const itemsRes = await svc.from("checklist_items").select("*").order("sort_order", { ascending: true });
  if (itemsRes.error) {
    return { ...empty, ready: !tableMissing(itemsRes.error, "checklist_items") };
  }
  const allItems: ChecklistItem[] = (itemsRes.data ?? []).map((r: any) => ({
    id: r.id,
    group: r.group_name ?? "운영",
    label: r.label ?? "",
    href: r.href ?? null,
    role: r.role ?? null,
    recurrence: (r.recurrence ?? "daily") as ChecklistItem["recurrence"],
    weekday: r.weekday ?? null,
    monthDay: r.month_day ?? null,
    sortOrder: r.sort_order ?? 0,
    active: r.active !== false,
  }));
  const active = allItems.filter((i) => i.active);

  const from7 = shiftDate(today, -6);
  const [todayMarksRes, myMarksRes] = await Promise.all([
    svc.from("checklist_marks").select("item_id,user_id").eq("check_date", today),
    svc.from("checklist_marks").select("check_date,item_id").eq("user_id", userId).gte("check_date", from7),
  ]);

  // 오늘 팀 완료 인원 + 내 완료
  const teamCount = new Map<string, number>();
  const myToday = new Set<string>();
  for (const m of (todayMarksRes.data ?? []) as { item_id: string; user_id: string }[]) {
    teamCount.set(m.item_id, (teamCount.get(m.item_id) ?? 0) + 1);
    if (m.user_id === userId) myToday.add(m.item_id);
  }

  const items: DueItem[] = active
    .filter((i) => isDueOn(i, today))
    .map((i) => ({ ...i, done: myToday.has(i.id), teamDone: teamCount.get(i.id) ?? 0 }));

  // 내 지난 7일 완료 기록 → 날짜별 완료 item 집합
  const myByDate = new Map<string, Set<string>>();
  for (const m of (myMarksRes.data ?? []) as { check_date: string; item_id: string }[]) {
    if (!myByDate.has(m.check_date)) myByDate.set(m.check_date, new Set());
    myByDate.get(m.check_date)!.add(m.item_id);
  }

  // 주간(오래된→오늘) 달성률
  const week = Array.from({ length: 7 }, (_, k) => {
    const d = shiftDate(today, -(6 - k));
    const due = active.filter((i) => isDueOn(i, d));
    const doneSet = myByDate.get(d) ?? new Set<string>();
    const doneN = due.filter((i) => doneSet.has(i.id)).length;
    const pct = due.length ? Math.round((doneN / due.length) * 100) : null;
    return { date: d, label: WEEKDAY_LABELS[new Date(d + "T00:00:00Z").getUTCDay()], due: due.length, done: doneN, pct };
  });

  // streak: 최신일부터 100% 연속(오늘 미완료는 끊지 않음, 지난날 미완료면 중단)
  let streak = 0;
  for (let k = week.length - 1; k >= 0; k--) {
    const day = week[k];
    if (day.due === 0) continue; // due 없는 날은 건너뜀
    if (day.pct === 100) streak++;
    else if (k === week.length - 1) continue; // 오늘은 아직 진행 중일 수 있음
    else break;
  }

  return { ready: true, items, allItems, myRole: detectRole(jobTitle, appRole), week, streak };
}

export const dynamic = "force-dynamic";
export const maxDuration = 60; // P&L 시트 조회 여유

const wonOrSet = (n: number | null) => (n == null ? "설정 필요" : Math.round(n).toLocaleString("ko-KR") + "원");

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

// P&L 요약 캐시(인스턴스 단위 10분). 구글 시트 왕복이 홈 렌더를 막지 않게 한다.
// 만료돼도 이전 값을 즉시 쓰고 백그라운드로 갱신하며, 첫 로드만 최대 4초 기다린다.
type PnlSummary = { period: string; revenue: number | null; cogs: number | null } | null;
let pnlCache: { at: number; value: PnlSummary } | null = null;
let pnlInflight: Promise<PnlSummary> | null = null;
const PNL_TTL_MS = 10 * 60 * 1000;

async function loadPnlSummary(): Promise<PnlSummary> {
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
}

async function getPnlSummary(): Promise<PnlSummary> {
  if (pnlCache && Date.now() - pnlCache.at < PNL_TTL_MS) return pnlCache.value;
  if (!pnlInflight) {
    pnlInflight = loadPnlSummary()
      .then((v) => { pnlCache = { at: Date.now(), value: v }; return v; })
      .catch(() => pnlCache?.value ?? null)
      .finally(() => { pnlInflight = null; });
  }
  if (pnlCache) return pnlCache.value; // 만료된 값이라도 즉시 표시, 갱신은 백그라운드
  return Promise.race([pnlInflight, new Promise<PnlSummary>((res) => setTimeout(() => res(null), 4000))]);
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
    checklist,
    pendingApprovals,
    pnl,
    resultCount,
    todoCount,
    planCount,
    meetCount,
    mlogCount,
    leaveCount,
    crmCount,
    poCount,
    invCount,
    pdevCount,
    eapprCount,
  ] = await Promise.all([
    safe(
      () => loadChecklist(svc, user.id, user.job_title ?? null, user.role, today),
      { ready: true, items: [], allItems: [], myRole: null, week: [], streak: 0 } as ChecklistBundle
    ),
    Promise.resolve(0), // AI 자동생성 중단 — ai_outputs 카운트 제거
    // P&L 시트에서 매출·매입(원가) — 10분 캐시, 홈 렌더 비차단.
    safe(() => getPnlSummary(), null as PnlSummary),
    cnt(t("tasks").eq("ai_agent_type", "marketer").eq("status", "완료")),
    cnt(t("todos").in("status", ["예정", "진행"])),
    Promise.resolve(0), // AI 자동생성 중단
    cnt(t("meetings")),
    cnt(t("manager_logs")),
    cnt(t("leave_usages")),
    cnt(t("crm_leads")),
    cnt(t("purchase_orders")),
    cnt(t("inventory_items")),
    cnt(t("product_developments")),
    cnt(t("approval_requests").eq("status", "pending")),
  ]);

  const counts: Record<string, number> = {
    "/todos": todoCount,
    "/meetings": meetCount,
    "/work-logs": mlogCount,
    "/leave": leaveCount,
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
  const focusLine = todoCount ? `진행 중 업무 ${todoCount}건` : "오늘 급한 알림은 없어요 👍";

  // 대표 전용: 백업 목록 (자동 백업은 AutoBackupTrigger가 렌더 후 백그라운드 실행)
  let backups: BackupMeta[] = [];
  if (isOwner) {
    const r = await safe(() => listBackups(), { ok: false } as Awaited<ReturnType<typeof listBackups>>);
    if (r.ok && r.items) backups = r.items;
  }

  // 계정별 개인 환경설정(즐겨찾기·숨김·체크리스트 필터/접힘)
  const prefs = await safe(() => getMyPrefs(), {});

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
        <Link href="/todos" className="btn primary" style={{ textDecoration: "none", flexShrink: 0 }}>
          오늘 할 일 보기 →
        </Link>
      </div>


      {/* 재무 요약(작게) — 매출·매입은 P&L 시트 기준 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
        <MiniStat title={`📈 매출 (P&L${pnl?.period ? " · " + pnl.period : ""})`} value={wonOrSet(pnl?.revenue ?? null)} href="/pnl" />
        <MiniStat title={`📉 매입·원가 (P&L${pnl?.period ? " · " + pnl.period : ""})`} value={wonOrSet(pnl?.cogs ?? null)} href="/pnl" />
      </div>

      {/* 일일 체크리스트 (계정별 필터·접힘 유지) */}
      <DailyChecklist today={today} bundle={checklist} isOwner={isOwner} initialRole={prefs.checklistRole} initialCollapsed={prefs.checklistCollapsed} />

      {/* 전체 폴더 — 즐겨찾기/숨김(계정별) + 빨간 알림 배지 */}
      <FolderCards groups={groups} counts={counts} pendingCount={pendingApprovals} pinned={prefs.pinnedFolders ?? []} hidden={prefs.hiddenFolders ?? []} />

      {/* 전체 되돌리기 (대표 전용) + 일일 자동 백업 백그라운드 실행 */}
      {isOwner && <GlobalRestore backups={backups} />}
      {isOwner && <AutoBackupTrigger />}
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
