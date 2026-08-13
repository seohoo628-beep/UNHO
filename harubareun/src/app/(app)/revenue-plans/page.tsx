import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import RevenuePlansClient, { type RevenuePlan } from "./RevenuePlansClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");

  const supabase = createSupabaseServerClient();
  let items: RevenuePlan[] = [];
  let dbReady = true;

  const res = await supabase
    .from("revenue_plans")
    .select("id,period_type,period_label,lever,title,plan,record,target,actual,status,log_date")
    .order("created_at", { ascending: false })
    .limit(500);

  if (res.error && (res.error.code === "42P01" || /revenue_plans/.test(res.error.message ?? ""))) {
    dbReady = false;
  } else if (!res.error) {
    items = (res.data ?? []).map((r: any) => ({
      id: r.id,
      periodType: r.period_type ?? "주",
      periodLabel: r.period_label ?? "",
      lever: r.lever ?? "유입·체류",
      title: r.title ?? "",
      plan: r.plan ?? "",
      record: r.record ?? "",
      target: r.target ?? "",
      actual: r.actual ?? "",
      status: r.status ?? "예정",
      logDate: r.log_date ?? "",
    }));
  }

  return <RevenuePlansClient items={items} today={seoulToday()} dbReady={dbReady} />;
}
