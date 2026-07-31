import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ShotUploader, DeleteShotButton } from "@/components/LibraryUploader";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const [{ data: brands }, { data: shots }] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    supabase
      .from("product_shots")
      .select("id, storage_path, file_name, label, brand_id, brands(name)")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const publicUrl = (p: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/${p}`;

  const rows = (shots ?? []) as unknown as {
    id: string;
    storage_path: string;
    file_name: string | null;
    label: string | null;
    brands: { name: string } | null;
  }[];

  // 브랜드별 그룹
  const byBrand = new Map<string, typeof rows>();
  for (const s of rows) {
    const name = s.brands?.name ?? "(미지정)";
    if (!byBrand.has(name)) byBrand.set(name, []);
    byBrand.get(name)!.push(s);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>제품컷 라이브러리</h1>
          <p>
            실제 제품 사진을 브랜드별로 올려둡니다. 디자이너 에이전트가 이 컷 목록을 참고해
            상세페이지·배너 배치 지시서를 만듭니다(AI가 이미지를 생성하지 않고, 실제 컷을 배치).
          </p>
        </div>
      </div>

      <ShotUploader brands={(brands ?? []) as { id: string; name: string }[]} />

      {rows.length === 0 ? (
        <div className="card empty">업로드된 제품컷이 없습니다.</div>
      ) : (
        [...byBrand.entries()].map(([name, list]) => (
          <section key={name}>
            <div className="section-title">
              {name} ({list.length})
            </div>
            <div className="card">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {list.map((s) => (
                  <div key={s.id} style={{ width: 140 }}>
                    <img
                      src={publicUrl(s.storage_path)}
                      alt={s.label ?? s.file_name ?? "제품컷"}
                      style={{
                        width: 140,
                        height: 140,
                        objectFit: "cover",
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                      }}
                    />
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {s.label ?? s.file_name ?? ""}
                    </div>
                    <DeleteShotButton id={s.id} path={s.storage_path} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
