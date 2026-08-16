import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getScopeBrandId } from "@/lib/brandScope";
import EventsClient, { type Ev } from "./EventsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");
  const supabase = createSupabaseServerClient();
  const scopeId = await getScopeBrandId();

  const { data: brandsRaw } = await supabase.from("brands").select("id, name").order("name");
  let q = supabase.from("marketing_events")
    .select("id, brand_id, status, title, rationale, benefit_type, channel, start_date, end_date, target_qty, target_revenue, actual_revenue, buyers, ad_cost, note, brands(name)")
    .order("start_date", { ascending: false, nullsFirst: false }).limit(500);
  if (scopeId) q = q.eq("brand_id", scopeId);
  const { data } = await q;
  const items = ((data ?? []) as any[]).map((r) => ({
    id: r.id, brandId: r.brand_id, brandName: r.brands?.name ?? null, status: r.status, title: r.title,
    rationale: r.rationale, benefitType: r.benefit_type, channel: r.channel, startDate: r.start_date, endDate: r.end_date,
    targetQty: r.target_qty, targetRevenue: r.target_revenue, actualRevenue: r.actual_revenue, buyers: r.buyers, adCost: r.ad_cost, note: r.note,
  })) as Ev[];

  return <EventsClient items={items} brands={(brandsRaw ?? []) as { id: string; name: string }[]} canEdit={user.role === "owner" || user.role === "staff"} />;
}
