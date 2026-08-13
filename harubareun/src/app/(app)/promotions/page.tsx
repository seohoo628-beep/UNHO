import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PromotionsClient, { type Promotion } from "./PromotionsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");

  const supabase = createSupabaseServerClient();
  let items: Promotion[] = [];
  let dbReady = true;

  const res = await supabase
    .from("promotions")
    .select("id,period_type,period_label,title,channel,plan,budget,result,outcome,status,start_date,end_date")
    .order("created_at", { ascending: false })
    .limit(500);

  if (res.error && (res.error.code === "42P01" || /promotions/.test(res.error.message ?? ""))) {
    dbReady = false;
  } else if (!res.error) {
    items = (res.data ?? []).map((r: any) => ({
      id: r.id,
      periodType: r.period_type ?? "월",
      periodLabel: r.period_label ?? "",
      title: r.title ?? "",
      channel: r.channel ?? "",
      plan: r.plan ?? "",
      budget: r.budget ?? null,
      result: r.result ?? "",
      outcome: r.outcome ?? "",
      status: r.status ?? "예정",
      startDate: r.start_date ?? "",
      endDate: r.end_date ?? "",
    }));
  }

  return <PromotionsClient items={items} dbReady={dbReady} />;
}
