import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AssetsClient, { type Asset } from "./AssetsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  let rows: Asset[] = [];
  let dbReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("product_assets")
      .select("id,title,kind,brand,link,thumb_url,note,created_at")
      .order("created_at", { ascending: false });
    if (error) dbReady = false;
    else
      rows = (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title ?? "",
        kind: r.kind ?? "이미지",
        brand: r.brand ?? "",
        link: r.link ?? "",
        thumbUrl: r.thumb_url ?? "",
        note: r.note ?? "",
      }));
  } catch {
    dbReady = false;
  }

  const canEdit = user.role === "owner" || user.role === "staff";
  return <AssetsClient rows={rows} dbReady={dbReady} canEdit={canEdit} />;
}
