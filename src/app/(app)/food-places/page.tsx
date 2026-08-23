import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import FoodPlacesClient, { type FoodPlace } from "./FoodPlacesClient";

export const dynamic = "force-dynamic";

// 맛집 저장 — 대표 전용.
export default async function Page() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) redirect("/hub");

  const supabase = createSupabaseServerClient();
  let items: FoodPlace[] = [];
  let dbReady = true;
  const { data, error } = await supabase
    .from("food_places")
    .select("id, name, category, phone, address, map_url, visited_on, companions, price, memo")
    .order("visited_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) {
    dbReady = false;
  } else {
    items = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name ?? "",
      category: r.category ?? "",
      phone: r.phone ?? "",
      address: r.address ?? "",
      mapUrl: r.map_url ?? "",
      visitedOn: r.visited_on ?? "",
      companions: r.companions ?? "",
      price: r.price ?? "",
      memo: r.memo ?? "",
    }));
  }

  return <FoodPlacesClient items={items} dbReady={dbReady} />;
}
