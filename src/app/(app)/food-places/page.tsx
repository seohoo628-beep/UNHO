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
  let { data, error } = await supabase
    .from("food_places")
    .select("id, name, category, phone, address, map_url, visited_on, companions, price, memo, photos, menu_photos, cuisine, region")
    .order("visited_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  // 사진·카테고리·지역 컬럼 미적용(0091·0092 전)이면 기본 컬럼만 재조회.
  if (error && (error.code === "42703" || /photos|menu_photos|cuisine|region/.test(error.message ?? ""))) {
    const retry = await supabase
      .from("food_places")
      .select("id, name, category, phone, address, map_url, visited_on, companions, price, memo")
      .order("visited_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    data = retry.data as any;
    error = retry.error;
  }
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
      photos: Array.isArray(r.photos) ? r.photos.filter((u: unknown) => typeof u === "string") : [],
      menuPhotos: Array.isArray(r.menu_photos) ? r.menu_photos.filter((u: unknown) => typeof u === "string") : [],
      cuisine: r.cuisine ?? "",
      region: r.region ?? "",
    }));
  }

  return <FoodPlacesClient items={items} dbReady={dbReady} />;
}
