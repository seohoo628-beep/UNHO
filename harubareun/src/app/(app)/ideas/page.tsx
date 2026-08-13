import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCeoUser } from "@/lib/ceo";
import IdeasClient, { type Idea } from "./IdeasClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) redirect("/");

  const supabase = createSupabaseServerClient();
  let items: Idea[] = [];
  let dbReady = true;

  const res = await supabase
    .from("ideas")
    .select("*")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (res.error && (res.error.code === "42P01" || /ideas/.test(res.error.message ?? ""))) {
    dbReady = false;
  } else if (!res.error) {
    items = (res.data ?? []).map((r: any) => ({
      id: r.id,
      title: r.title ?? "",
      body: r.body ?? "",
      tags: r.tags ?? "",
      status: r.status ?? "수집",
      pinned: !!r.pinned,
      updatedAt: r.updated_at ?? r.created_at ?? "",
    }));
  }

  return <IdeasClient items={items} dbReady={dbReady} />;
}
