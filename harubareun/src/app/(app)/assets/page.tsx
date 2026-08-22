import { requireAppUser } from "@/lib/auth";
import { isFolderUnlocked } from "@/lib/folderLock";
import FolderLockGate from "@/components/FolderLockGate";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AssetsClient, { type Asset } from "./AssetsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (!isFolderUnlocked()) return <FolderLockGate title="각종 자료" />;

  let rows: Asset[] = [];
  let folders: string[] = [];
  let dbReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const fr = await supabase.from("asset_folders").select("name").order("name");
    if (!fr.error) folders = (fr.data ?? []).map((r: any) => r.name).filter(Boolean);
    const { data, error } = await supabase
      .from("product_assets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) dbReady = false;
    else
      rows = (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title ?? "",
        kind: r.kind ?? "이미지",
        brand: r.brand ?? "",
        folder: r.folder ?? "",
        link: r.link ?? "",
        thumbUrl: r.thumb_url ?? "",
        note: r.note ?? "",
      }));
  } catch {
    dbReady = false;
  }

  const canEdit = user.role === "owner" || user.role === "staff";
  return <AssetsClient rows={rows} folders={folders} dbReady={dbReady} canEdit={canEdit} />;
}
