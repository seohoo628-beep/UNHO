import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBrandScopeSlug, listScopeBrands } from "@/lib/brandScope";
import LaunchPrepClient, { type CheckItem, type Revision } from "./LaunchPrepClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");
  const supabase = createSupabaseServerClient();

  const slug = getBrandScopeSlug();

  const [{ data: cData }, { data: rData }] = await Promise.all([
    supabase
      .from("launch_checklist")
      .select("id, scope, seq, category, item, owner_role, collab, reviewer, priority, prereq, due_date, status, note, checklist, sort_order")
      .order("sort_order"),
    supabase
      .from("launch_page_revisions")
      .select("id, product, section, original, grade, action, revision, rationale, sort_order")
      .order("sort_order"),
  ]);

  let items = ((cData ?? []) as any[]).map((r) => ({
    id: r.id, scope: r.scope, seq: r.seq, category: r.category, item: r.item,
    owner: r.owner_role, collab: r.collab, reviewer: r.reviewer, priority: r.priority,
    prereq: r.prereq, due: r.due_date, status: r.status, note: r.note,
    checklist: Array.isArray(r.checklist) ? r.checklist : [],
  })) as CheckItem[];

  // 브랜드 선택 시 전사 + 해당 브랜드만.
  if (slug !== "all") {
    const brands = await listScopeBrands();
    const name = brands.find((b) => b.slug === slug)?.name;
    if (name) items = items.filter((c) => c.scope === "전사" || c.scope === name);
  }

  const revisions = ((rData ?? []) as any[]).map((r) => ({
    id: r.id, product: r.product, section: r.section, original: r.original,
    grade: r.grade, action: r.action, revision: r.revision, rationale: r.rationale,
  })) as Revision[];

  return (
    <LaunchPrepClient
      items={items}
      revisions={revisions}
      canEdit={user.role === "owner" || user.role === "staff"}
    />
  );
}
