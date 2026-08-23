import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCeoUser } from "@/lib/ceo";
import BusinessCardsClient, { type Card } from "./BusinessCardsClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 명함 AI 인식(비전)이 10초를 넘길 수 있어 시간 여유 확보

export default async function Page() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) redirect("/");

  const supabase = createSupabaseServerClient();
  let items: Card[] = [];
  let dbReady = true;

  const res = await supabase
    .from("business_cards")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (res.error && (res.error.code === "42P01" || /business_cards/.test(res.error.message ?? ""))) {
    dbReady = false;
  } else if (!res.error) {
    items = (res.data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name ?? "",
      company: r.company ?? "",
      department: r.department ?? "",
      position: r.position ?? "",
      mobile: r.mobile ?? "",
      officePhone: r.office_phone ?? "",
      email: r.email ?? "",
      fax: r.fax ?? "",
      address: r.address ?? "",
      website: r.website ?? "",
      tags: r.tags ?? "",
      imageUrl: r.image_url ?? "",
      metDate: r.met_date ?? "",
      registeredDate: r.registered_date ?? "",
      location: r.location ?? "",
      note: r.note ?? "",
    }));
  }

  return <BusinessCardsClient items={items} dbReady={dbReady} canEdit={true} />;
}
