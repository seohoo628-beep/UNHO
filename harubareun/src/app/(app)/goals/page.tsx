import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBrandScopeSlug, listScopeBrands } from "@/lib/brandScope";
import GoalsClient, { type Goal } from "./GoalsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");
  const supabase = createSupabaseServerClient();

  const slug = getBrandScopeSlug();
  const { data } = await supabase.from("revenue_goals").select("id, scope, metric, value, unit, note").order("sort_order");
  let goals = ((data ?? []) as any[]).map((r) => ({ id: r.id, scope: r.scope, metric: r.metric, value: r.value == null ? null : Number(r.value), unit: r.unit, note: r.note })) as Goal[];

  // 브랜드 선택 시 전사 + 해당 브랜드만.
  if (slug !== "all") {
    const brands = await listScopeBrands();
    const name = brands.find((b) => b.slug === slug)?.name;
    if (name) goals = goals.filter((g) => g.scope === "전사" || g.scope === name);
  }
  return <GoalsClient goals={goals} canEdit={user.role === "owner" || user.role === "staff"} />;
}
