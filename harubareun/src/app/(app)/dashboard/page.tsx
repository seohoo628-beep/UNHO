import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBrandScopeSlug, listScopeBrands } from "@/lib/brandScope";
import { fmtDate } from "@/lib/time";
import ContentGallery, { type GalleryItem } from "./ContentGallery";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");
  const supabase = createSupabaseServerClient();

  const slug = getBrandScopeSlug();
  const scopeBrands = await listScopeBrands();
  const scopeName = slug === "all" ? null : scopeBrands.find((b) => b.slug === slug)?.name ?? null;
  const scopeId = slug === "all" ? null : scopeBrands.find((b) => b.slug === slug)?.id ?? null;

  let query = supabase
    .from("content_gallery")
    .select("id, brand_id, category, title, storage_path, file_name, mime, created_at, brands(name), users(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  // 브랜드 선택 시 해당 브랜드 + 공통(brand 없음)만.
  if (scopeId) query = query.or(`brand_id.eq.${scopeId},brand_id.is.null`);

  const { data } = await query;
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/`;

  const items = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    brand: r.brands?.name ?? null,
    category: r.category ?? "기타",
    title: r.title,
    url: base + r.storage_path,
    path: r.storage_path,
    fileName: r.file_name,
    mime: r.mime,
    uploader: r.users?.name ?? null,
    createdAt: fmtDate(r.created_at),
  })) as GalleryItem[];

  const canEdit = user.role === "owner" || user.role === "staff";
  const brands = scopeBrands.map((b) => ({ id: b.id, name: b.name }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>콘텐츠 결과물{scopeName ? ` · ${scopeName}` : ""}</h1>
          <p>실제 디자이너가 만든 브랜딩·광고 콘텐츠를 업로드하고 공유합니다.</p>
        </div>
      </div>
      <ContentGallery items={items} brands={brands} canEdit={canEdit} />
    </div>
  );
}
