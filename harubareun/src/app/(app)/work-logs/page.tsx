import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import { tableMissing } from "@/lib/db";
import WorkLogsClient from "./WorkLogsClient";
import TodoNotices, { type Notice } from "@/components/TodoNotices";
import { ROLES, type WorkLog } from "./roles";
import { type Log as ManagerLog, type Incentive } from "../manager-log/ManagerLogClient";

export const dynamic = "force-dynamic";

function mapLogs(rows: any[]): WorkLog[] {
  return (rows ?? []).map((r: any) => ({
    id: r.id,
    kind: r.kind ?? "일일업무일지",
    logDate: r.log_date ?? "",
    title: r.title ?? "",
    note: r.note ?? "",
    files: Array.isArray(r.files) ? r.files : [],
    authorName: r.users?.name ?? "",
  }));
}

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");

  const supabase = createSupabaseServerClient();

  const roleQueries = ROLES.map((r) =>
    supabase
      .from(r.table)
      .select("id,kind,log_date,title,note,files,users:author_user_id(name)")
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500)
  );

  const [userRes, mgrLogRes, mgrIncRes, nr, ...roleRes] = await Promise.all([
    supabase.from("users").select("id, name").neq("role", "ai").neq("role", "guest").order("name"),
    supabase.from("manager_logs").select("id,log_date,category,task,status,note").order("log_date", { ascending: false }).limit(500),
    supabase.from("manager_incentives").select("id,month,gonggu_count,gonggu_sales,promo_sales,rate_pct,note").order("month", { ascending: false }),
    // 업무일지 전용 공지(scope='worklog') — 별도 왕복 대신 병렬 조회
    supabase
      .from("todo_notices")
      .select("id, body, pinned, created_at, users:created_by(name)")
      .eq("scope", "worklog")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    ...roleQueries,
  ]);

  const roleLogs: Record<string, WorkLog[]> = {};
  const roleReady: Record<string, boolean> = {};
  const roleError: Record<string, string> = {};
  ROLES.forEach((r, i) => {
    const res = roleRes[i];
    const missing = !!(res.error && tableMissing(res.error, r.table));
    roleReady[r.key] = !missing;
    // 테이블 없음이 아닌 오류(권한·타임아웃 등)는 빈 목록으로 위장하지 않고 표시한다.
    if (res.error && !missing) roleError[r.key] = res.error.message ?? "조회 오류";
    roleLogs[r.key] = res.error ? [] : mapLogs(res.data ?? []);
  });

  const users = (userRes.data ?? []) as { id: string; name: string }[];

  const managerReady = !mgrLogRes.error;
  const managerLogs: ManagerLog[] = (mgrLogRes.data ?? []).map((r: any) => ({
    id: r.id,
    logDate: r.log_date ?? "",
    category: r.category ?? "",
    task: r.task ?? "",
    status: r.status ?? "예정",
    note: r.note ?? "",
  }));
  const managerIncentives: Incentive[] = (mgrIncRes.data ?? []).map((r: any) => ({
    id: r.id,
    month: r.month ?? "",
    gongguCount: Number(r.gonggu_count) || 0,
    gongguSales: Number(r.gonggu_sales) || 0,
    promoSales: Number(r.promo_sales) || 0,
    ratePct: Number(r.rate_pct) || 0,
    note: r.note ?? "",
  }));

  let notices: Notice[] = [];
  let noticeReady = true;
  if (nr.error) {
    noticeReady = !(nr.error.code === "42P01" || nr.error.code === "42703" || /todo_notices|scope/.test(nr.error.message ?? ""));
  } else {
    notices = (nr.data ?? []).map((r: any) => ({ id: r.id, body: r.body, pinned: !!r.pinned, authorName: r.users?.name ?? null, createdAt: r.created_at }));
  }
  const canEdit = user.role === "owner" || user.role === "staff";

  return (
    <>
      <TodoNotices notices={notices} canEdit={canEdit} dbReady={noticeReady} scope="worklog" />
      <WorkLogsClient
        roleLogs={roleLogs}
        roleReady={roleReady}
        roleError={roleError}
        users={users}
        today={seoulToday()}
        manager={{ logs: managerLogs, incentives: managerIncentives, dbReady: managerReady }}
      />
    </>
  );
}
