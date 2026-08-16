import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import { type Log, type Incentive } from "../manager-log/ManagerLogClient";
import { type DesignerLog } from "../designer-log/DesignerLogClient";
import WorkLogsTabs from "./WorkLogsTabs";

export const dynamic = "force-dynamic";

// 경영지원매니저 일지 + 디자이너 일지를 한 화면(탭)으로 통합.
export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");

  const supabase = createSupabaseServerClient();
  let mgrLogs: Log[] = [];
  let incentives: Incentive[] = [];
  let mgrReady = true;
  let dsnLogs: DesignerLog[] = [];
  let users: { id: string; name: string }[] = [];
  let dsnReady = true;

  const [lr, ir, dr, ur] = await Promise.all([
    supabase.from("manager_logs").select("id,log_date,category,task,status,note").order("log_date", { ascending: false }).limit(500),
    supabase.from("manager_incentives").select("id,month,gonggu_count,gonggu_sales,promo_sales,rate_pct,note").order("month", { ascending: false }),
    supabase.from("designer_logs").select("id,kind,log_date,title,note,files,users:author_user_id(name)").order("log_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("users").select("id, name").neq("role", "ai").neq("role", "guest").order("name"),
  ]);

  if (lr.error) mgrReady = false;
  else {
    mgrLogs = (lr.data ?? []).map((r: any) => ({ id: r.id, logDate: r.log_date ?? "", category: r.category ?? "", task: r.task ?? "", status: r.status ?? "예정", note: r.note ?? "" }));
    incentives = (ir.data ?? []).map((r: any) => ({ id: r.id, month: r.month ?? "", gongguCount: Number(r.gonggu_count) || 0, gongguSales: Number(r.gonggu_sales) || 0, promoSales: Number(r.promo_sales) || 0, ratePct: Number(r.rate_pct) || 0, note: r.note ?? "" }));
  }

  if (dr.error && (dr.error.code === "42P01" || /designer_logs/.test(dr.error.message ?? ""))) {
    dsnReady = false;
  } else if (!dr.error) {
    dsnLogs = (dr.data ?? []).map((r: any) => ({ id: r.id, kind: r.kind ?? "일일업무일지", logDate: r.log_date ?? "", title: r.title ?? "", note: r.note ?? "", files: Array.isArray(r.files) ? r.files : [], authorName: r.users?.name ?? "" }));
  }
  users = (ur.data ?? []) as { id: string; name: string }[];

  return (
    <WorkLogsTabs
      today={seoulToday()}
      manager={{ logs: mgrLogs, incentives, dbReady: mgrReady }}
      designer={{ logs: dsnLogs, users, dbReady: dsnReady }}
    />
  );
}
