import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import { tableMissing } from "@/lib/db";
import WorkLogsClient, { ROLES, type WorkLog } from "./WorkLogsClient";
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

  const [userRes, mgrLogRes, mgrIncRes, ...roleRes] = await Promise.all([
    supabase.from("users").select("id, name").neq("role", "ai").neq("role", "guest").order("name"),
    supabase.from("manager_logs").select("id,log_date,category,task,status,note").order("log_date", { ascending: false }).limit(500),
    supabase.from("manager_incentives").select("id,month,gonggu_count,gonggu_sales,promo_sales,rate_pct,note").order("month", { ascending: false }),
    ...roleQueries,
  ]);

  const roleLogs: Record<string, WorkLog[]> = {};
  const roleReady: Record<string, boolean> = {};
  ROLES.forEach((r, i) => {
    const res = roleRes[i];
    roleReady[r.key] = !(res.error && tableMissing(res.error, r.table));
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

  return (
    <WorkLogsClient
      roleLogs={roleLogs}
      roleReady={roleReady}
      users={users}
      today={seoulToday()}
      manager={{ logs: managerLogs, incentives: managerIncentives, dbReady: managerReady }}
    />
  );
}
