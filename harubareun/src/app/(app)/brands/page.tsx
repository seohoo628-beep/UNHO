import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import BrandCard from "@/components/BrandCard";
import type { Brand, Corporation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const user = await requireAppUser();
  const supabase = createSupabaseServerClient();

  const [{ data: corps }, { data: brands }] = await Promise.all([
    supabase.from("corporations").select("*").order("name"),
    supabase.from("brands").select("*").order("name"),
  ]);

  const corpList = (corps ?? []) as Corporation[];
  const brandList = (brands ?? []) as Brand[];
  const corpById = new Map(corpList.map((c) => [c.id, c]));
  const canEdit = user.role === "owner" || user.role === "staff";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>브랜드</h1>
          <p>
            brand_master 이관 데이터. VI 팔레트는 미리보기와 함께 편집한다. 서체는 전 브랜드
            Pretendard 단일 체계다.
          </p>
        </div>
      </div>

      {corpList.map((corp) => {
        const owned = brandList.filter((b) => b.corporation_id === corp.id);
        if (owned.length === 0) return null;
        const kindLabel =
          corp.kind === "own" ? "자사" : corp.kind === "partner" ? "파트너" : "제휴";
        const isParty = corp.entity_type === "own";
        return (
          <section key={corp.id} style={{ marginBottom: 8 }}>
            <div className="section-title">
              {corp.name} · {kindLabel}
              {corp.business_no ? ` · ${corp.business_no}` : " · 사업자번호 미확인"}{" "}
              <span className={`badge ${isParty ? "ok" : ""}`}>
                {isParty ? "발주·계약 당사자 가능" : "당사자 선택 불가 (파트너)"}
              </span>
            </div>
            {owned.map((b) => (
              <BrandCard
                key={b.id}
                brand={b}
                corpName={corpById.get(b.corporation_id)?.name ?? "-"}
                canEdit={canEdit}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
