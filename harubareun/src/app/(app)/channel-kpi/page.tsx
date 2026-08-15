import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getScopeBrandId } from "@/lib/brandScope";
import ChannelKpiClient, { type Kpi } from "./ChannelKpiClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");
  const supabase = createSupabaseServerClient();
  const scopeId = await getScopeBrandId();

  const { data: brandsRaw } = await supabase.from("brands").select("id, name").order("name");
  let q = supabase.from("channel_kpis").select("id, category, metric, target, current, target_date, performer, note, brand_id, brands(name)").order("sort_order");
  if (scopeId) q = q.eq("brand_id", scopeId);
  const { data } = await q;
  const items = ((data ?? []) as any[]).map((r) => ({
    id: r.id, brandName: r.brands?.name ?? null, category: r.category, metric: r.metric,
    target: r.target, current: Number(r.current ?? 0), targetDate: r.target_date, performer: r.performer, note: r.note,
  })) as Kpi[];

  return <ChannelKpiClient items={items} brands={(brandsRaw ?? []) as { id: string; name: string }[]} canEdit={user.role === "owner" || user.role === "staff"} />;
}
