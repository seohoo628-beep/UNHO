import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 전역 브랜드 선택(하루바른/나아 분리). 쿠키에 slug 저장, "all"이면 전체.
export const BRAND_SCOPE_COOKIE = "brand_scope";

export type ScopeBrand = { id: string; name: string; slug: string };

export function getBrandScopeSlug(): string {
  try {
    return cookies().get(BRAND_SCOPE_COOKIE)?.value || "all";
  } catch {
    return "all";
  }
}

export async function listScopeBrands(): Promise<ScopeBrand[]> {
  try {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.from("brands").select("id, name, slug").order("slug");
    return (data ?? []) as ScopeBrand[];
  } catch {
    return [];
  }
}

// 현재 스코프의 brand_id. "all"이거나 매칭 없으면 null(=필터 없음).
export async function getScopeBrandId(brands?: ScopeBrand[]): Promise<string | null> {
  const slug = getBrandScopeSlug();
  if (slug === "all") return null;
  const list = brands && brands.length ? brands : await listScopeBrands();
  return list.find((b) => b.slug === slug)?.id ?? null;
}
