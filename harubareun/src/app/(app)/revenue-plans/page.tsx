import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getScopeBrandId } from "@/lib/brandScope";
import { seoulToday } from "@/lib/time";
import RevenuePlansClient, { type RevenuePlan } from "./RevenuePlansClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");

  const supabase = createSupabaseServerClient();
  const scopeId = await getScopeBrandId();
  let items: RevenuePlan[] = [];
  let dbReady = true;

  const { data: brandsRaw } = await supabase.from("brands").select("id, name").order("name");
  const brands = (brandsRaw ?? []) as { id: string; name: string }[];

  let q = supabase
    .from("revenue_plans")
    .select("id,period_type,period_label,lever,title,plan,record,target,actual,status,log_date,brand_id,brands(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (scopeId) q = q.eq("brand_id", scopeId);
  const res = await q;

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
      brandId: r.brand_id ?? null,
      brandName: r.brands?.name ?? null,
    }));
  }

  return <RevenuePlansClient items={items} today={seoulToday()} dbReady={dbReady} brands={brands} />;
}
