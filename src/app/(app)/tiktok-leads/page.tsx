import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCeoUser } from "@/lib/ceo";
import TikTokLeadsClient, { type Lead } from "./TikTokLeadsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) redirect("/");

  const supabase = createSupabaseServerClient();
  let items: Lead[] = [];
  let dbReady = true;

  // select * 로 조회 → 아직 없는 컬럼(마이그레이션 전)이 있어도 안전.
  const res = await supabase
    .from("tiktok_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(3000);

  if (res.error && (res.error.code === "42P01" || /tiktok_leads/.test(res.error.message ?? ""))) {
    dbReady = false;
  } else if (!res.error) {
    items = (res.data ?? []).map((r: any) => ({
      id: r.id,
      handle: r.handle ?? "",
      name: r.name ?? "",
      category: r.category ?? "",
      stage: r.stage ?? "",
      followers: r.followers ?? null,
      product: r.product ?? "",
      contact: r.contact ?? "",
      contact2: r.contact2 ?? "",
      email: r.email ?? "",
      link: r.link ?? "",
      agency: r.agency ?? "",
      source: r.source ?? "",
      note: r.note ?? "",
    }));
  }

  return <TikTokLeadsClient items={items} dbReady={dbReady} />;
}
