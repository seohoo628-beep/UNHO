"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { regionFromAddress } from "@/lib/region";

const PUBLIC_MARKER = "/storage/v1/object/public/generated-media/";

type Result = { ok: boolean; error?: string };

async function ceoGuard(): Promise<boolean> {
  try {
    const u = await requireAppUser();
    return isCeoUser(u);
  } catch {
    return false;
  }
}

export type FoodPlaceInput = {
  name: string;
  category?: string;
  phone?: string;
  address?: string;
  mapUrl?: string;
  visitedOn?: string;   // YYYY-MM-DD
  companions?: string;
  price?: string;
  memo?: string;
  photos?: string[];      // 매장 사진 URL 목록
  menuPhotos?: string[];  // 메뉴 사진 URL 목록
  cuisine?: string;       // 한식/고기집/중식/일식 등
  region?: string;        // 지역(동네) — 예: 성수동, 역삼동
};

const urlList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).filter((u): u is string => typeof u === "string" && u.startsWith("http")).slice(0, 20);

const clean = (i: FoodPlaceInput) => ({
  name: (i.name ?? "").trim(),
  category: (i.category ?? "").trim() || null,
  phone: (i.phone ?? "").trim() || null,
  address: (i.address ?? "").trim() || null,
  map_url: (i.mapUrl ?? "").trim() || null,
  visited_on: /^\d{4}-\d{2}-\d{2}$/.test((i.visitedOn ?? "").trim()) ? i.visitedOn!.trim() : null,
  companions: (i.companions ?? "").trim() || null,
  price: (i.price ?? "").trim() || null,
  memo: (i.memo ?? "").trim() || null,
  photos: urlList(i.photos),
  menu_photos: urlList(i.menuPhotos),
  cuisine: (i.cuisine ?? "").trim() || null,
  region: (i.region ?? "").trim() || null,
});

// 사진·카테고리·지역 컬럼 미적용(0091·0092 전)이면 해당 컬럼 없이 재시도.
const isMissingPhotos = (err: { code?: string; message?: string } | null) =>
  !!err && (err.code === "42703" || /photos|menu_photos|cuisine|region/.test(err.message ?? ""));
const stripNewCols = <T extends Record<string, unknown>>(row: T) => {
  const { photos: _a, menu_photos: _b, cuisine: _c, region: _d, ...rest } = row as Record<string, unknown>;
  return rest;
};

export async function createFoodPlace(input: FoodPlaceInput): Promise<Result> {
  if (!(await ceoGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const row = clean(input);
  if (!row.name) return { ok: false, error: "상호를 입력하세요." };
  const supabase = createSupabaseServerClient();
  let ins = await supabase.from("food_places").insert(row);
  if (ins.error && isMissingPhotos(ins.error)) ins = await supabase.from("food_places").insert(stripNewCols(row));
  if (ins.error) {
    if (ins.error.code === "42P01") return { ok: false, error: "테이블이 없습니다. 설정 → DB 스키마 점검에서 0090 SQL을 실행해 주세요." };
    return { ok: false, error: ins.error.message };
  }
  revalidatePath("/food-places");
  return { ok: true };
}

export async function updateFoodPlace(id: string, input: FoodPlaceInput): Promise<Result> {
  if (!(await ceoGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const row = clean(input);
  if (!row.name) return { ok: false, error: "상호를 입력하세요." };
  const supabase = createSupabaseServerClient();
  let upd = await supabase.from("food_places").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id);
  if (upd.error && isMissingPhotos(upd.error)) {
    upd = await supabase.from("food_places").update({ ...stripNewCols(row), updated_at: new Date().toISOString() }).eq("id", id);
  }
  if (upd.error) return { ok: false, error: upd.error.message };
  revalidatePath("/food-places");
  return { ok: true };
}

export async function deleteFoodPlace(id: string, photoUrls?: string[]): Promise<Result> {
  if (!(await ceoGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  // 스토리지의 사진 파일도 정리(실패는 무시).
  const paths = (photoUrls ?? [])
    .filter((u) => typeof u === "string" && u.includes(PUBLIC_MARKER))
    .map((u) => decodeURIComponent(u.split(PUBLIC_MARKER)[1] || ""))
    .filter(Boolean);
  if (paths.length) {
    try { await createSupabaseServiceClient().storage.from("generated-media").remove(paths); } catch { /* noop */ }
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("food_places").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/food-places");
  return { ok: true };
}

// ── 상호 자동검색: 카카오 장소검색(키워드) API ──
export type PlaceHit = {
  name: string;
  category: string;
  phone: string;
  address: string;
  mapUrl: string;
  region: string; // 동네(지번주소 기준) — 예: 성수동2가
};

export async function searchPlace(query: string): Promise<{ ok: boolean; error?: string; hits?: PlaceHit[] }> {
  if (!(await ceoGuard())) return { ok: false, error: "대표만 사용할 수 있습니다." };
  const q = (query ?? "").trim();
  if (q.length < 2) return { ok: false, error: "상호를 2자 이상 입력하세요." };
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return { ok: false, error: "카카오 REST API 키(KAKAO_REST_API_KEY)가 없어 자동검색을 쓸 수 없습니다. 주소·전화는 직접 입력해 주세요." };
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=7`,
      { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store" }
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (/OPEN_MAP_AND_LOCAL/i.test(t)) {
        return {
          ok: false,
          error: "카카오 앱에서 '카카오맵' 서비스가 꺼져 있습니다. developers.kakao.com → 내 애플리케이션 → 해당 앱 → 카카오맵 → 활성화(ON) 하면 바로 검색이 됩니다. (무료·1분 소요)",
        };
      }
      return { ok: false, error: `검색 실패(${res.status}): ${t.slice(0, 120)}` };
    }
    const data: any = await res.json();
    const hits: PlaceHit[] = ((data?.documents ?? []) as any[]).map((d) => ({
      name: String(d.place_name ?? ""),
      // "음식점 > 한식 > 국밥" → 앞의 '음식점 >' 은 생략해 간결하게.
      category: String(d.category_name ?? "").replace(/^음식점 > /, ""),
      phone: String(d.phone ?? ""),
      address: String(d.road_address_name || d.address_name || ""),
      mapUrl: String(d.place_url ?? ""),
      region: regionFromAddress(String(d.address_name ?? "")), // 지번주소에서 동네 추출
    })).filter((h) => h.name);
    return { ok: true, hits };
  } catch (e) {
    return { ok: false, error: `검색 오류: ${e instanceof Error ? e.message : String(e)}` };
  }
}
