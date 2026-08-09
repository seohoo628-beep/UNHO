import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CommerceLecturesClient, { type Lecture } from "./CommerceLecturesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");

  const supabase = createSupabaseServerClient();
  let items: Lecture[] = [];
  let dbReady = true;

  const res = await supabase
    .from("commerce_lectures")
    .select("id,title,category,note,link,files")
    .order("created_at", { ascending: false })
    .limit(500);

  if (res.error && (res.error.code === "42P01" || /commerce_lectures/.test(res.error.message ?? ""))) {
    dbReady = false;
  } else if (!res.error) {
    items = (res.data ?? []).map((r: any) => ({
      id: r.id,
      title: r.title ?? "",
      category: r.category ?? "",
      note: r.note ?? "",
      link: r.link ?? "",
      files: Array.isArray(r.files) ? r.files : [],
    }));
  }

  return <CommerceLecturesClient items={items} dbReady={dbReady} />;
}
