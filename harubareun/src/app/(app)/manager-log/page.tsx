import { requireAppUser } from "@/lib/auth";
import { seoulToday } from "@/lib/time";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ManagerLogClient, { type Log, type Incentive } from "./ManagerLogClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  let logs: Log[] = [];
  let incentives: Incentive[] = [];
  let dbReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const [lr, ir] = await Promise.all([
      supabase
        .from("manager_logs")
        .select("id,log_date,category,task,status,note")
        .order("log_date", { ascending: false })
        .limit(500),
      supabase
        .from("manager_incentives")
        .select("id,month,gonggu_count,gonggu_sales,promo_sales,rate_pct,note")
        .order("month", { ascending: false }),
    ]);
    if (lr.error) dbReady = false;
    else {
      logs = (lr.data ?? []).map((r: any) => ({
        id: r.id,
        logDate: r.log_date ?? "",
        category: r.category ?? "",
        task: r.task ?? "",
        status: r.status ?? "예정",
        note: r.note ?? "",
      }));
      incentives = (ir.data ?? []).map((r: any) => ({
        id: r.id,
        month: r.month ?? "",
        gongguCount: Number(r.gonggu_count) || 0,
        gongguSales: Number(r.gonggu_sales) || 0,
        promoSales: Number(r.promo_sales) || 0,
        ratePct: Number(r.rate_pct) || 0,
        note: r.note ?? "",
      }));
    }
  } catch {
    dbReady = false;
  }

  const today = seoulToday();
  return <ManagerLogClient logs={logs} incentives={incentives} dbReady={dbReady} today={today} />;
}
