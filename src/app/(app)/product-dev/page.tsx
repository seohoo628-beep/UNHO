import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtDate, seoulToday } from "@/lib/time";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { ProductDevForm, StageSelect, ProductDevRowActions } from "@/components/ProductDevForms";
import ProductScreeningPanel from "@/components/ProductScreeningPanel";
import { listScreenings } from "@/app/(app)/commerce-framework/actions";
import type { ProductDevelopment } from "@/lib/types";

export const dynamic = "force-dynamic";

const SETUP_SQL = `create table if not exists public.product_developments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_id uuid references public.brands(id) on delete set null,
  category text,
  stage text not null default '아이디어'
    check (stage in ('아이디어','기획','샘플','검토','양산','출시','보류')),
  target_date date,
  cost_estimate bigint,
  vendor_id uuid references public.vendors(id) on delete set null,
  link text,
  note text,
  owner_user_id uuid references public.users(id) on delete set null,
  launched_at date,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_developments enable row level security;
drop policy if exists product_developments_all on public.product_developments;
create policy product_developments_all on public.product_developments for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const STAGE_ORDER = ["아이디어", "기획", "샘플", "검토", "양산", "출시", "보류"];
const STAGE_COLOR: Record<string, string> = {
  아이디어: "#94a3b8",
  기획: "#6366f1",
  샘플: "#0ea5e9",
  검토: "#f59e0b",
  양산: "#8b5cf6",
  출시: "#10b981",
  보류: "#ef4444",
};

export default async function ProductDevPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const [{ data: brandsRaw }, { data: vendorsRaw }, { data: usersRaw }, pdRes] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("vendors").select("id, name").order("name"),
    supabase.from("users").select("id, name").neq("role", "ai").order("name"),
    supabase.from("product_developments").select("*, brands(name), vendors(name), users:owner_user_id(name)").order("updated_at", { ascending: false }),
  ]);

  if (pdRes.error && (pdRes.error.code === "42P01" || /product_developments/.test(pdRes.error.message ?? ""))) {
    return (
      <div>
        <div className="page-head">
          <h1>제품개발</h1>
        </div>
        <DbSetupNotice title="제품개발" sql={SETUP_SQL} />
      </div>
    );
  }

  const brands = (brandsRaw ?? []) as { id: string; name: string }[];
  const vendors = (vendorsRaw ?? []) as { id: string; name: string }[];
  const users = (usersRaw ?? []) as { id: string; name: string }[];
  const list = (pdRes.data ?? []) as unknown as (ProductDevelopment & {
    brands: { name: string } | null;
    vendors: { name: string } | null;
    users: { name: string } | null;
  })[];

  const screenRes = await listScreenings();

  const active = list.filter((p) => p.stage !== "출시" && p.stage !== "보류");
  const launched = list.filter((p) => p.stage === "출시");
  const held = list.filter((p) => p.stage === "보류");
  const today = seoulToday();

  const byStage = new Map<string, typeof list>();
  for (const s of STAGE_ORDER) byStage.set(s, []);
  for (const p of list) byStage.get(p.stage)?.push(p);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>제품개발</h1>
          <p>신제품 개발 파이프라인. 아이디어 → 기획 → 샘플 → 검토 → 양산 → 출시 단계로 관리한다.</p>
        </div>
        <ProductDevForm brands={brands} vendors={vendors} users={users} />
      </div>

      <ProductScreeningPanel initial={screenRes.items} brands={brands} tableMissing={screenRes.tableMissing} />

      {/* 단계별 요약 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {STAGE_ORDER.map((s) => {
          const n = byStage.get(s)?.length ?? 0;
          return (
            <div
              key={s}
              className="card"
              style={{ padding: "8px 14px", borderLeft: `4px solid ${STAGE_COLOR[s]}`, minWidth: 96 }}
            >
              <div className="muted" style={{ fontSize: 11 }}>{s}</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{n}</div>
            </div>
          );
        })}
      </div>

      {/* 진행 중 개발건 */}
      <div className="section-title">진행 중 ({active.length})</div>
      {active.length === 0 ? (
        <div className="card">
          <div className="empty">진행 중인 개발건이 없습니다. &ldquo;+ 개발건 등록&rdquo;으로 추가하세요.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {active.map((p) => {
            const overdue = p.target_date && p.target_date < today;
            return (
              <div key={p.id} className="card" style={{ padding: 14, borderLeft: `4px solid ${STAGE_COLOR[p.stage]}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {p.name}
                      {p.link && (
                        <a href={p.link} target="_blank" rel="noreferrer" className="btn sm" style={{ marginLeft: 8 }}>🔗</a>
                      )}
                    </div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                      {p.brands?.name ?? "브랜드 미지정"}
                      {p.category ? ` · ${p.category}` : ""}
                      {p.users?.name ? ` · 담당 ${p.users.name}` : ""}
                      {p.vendors?.name ? ` · 파트너 ${p.vendors.name}` : ""}
                    </div>
                    {p.note && <div style={{ fontSize: 13, marginTop: 5 }}>{p.note}</div>}
                    {p.files && p.files.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        {p.files.map((f, idx) => (
                          <a key={idx} href={f.url} target="_blank" rel="noreferrer" className="btn sm" title={f.name}>
                            📎 {f.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, alignItems: "flex-start" }}>
                    <div>
                      <div className="muted" style={{ fontSize: 11 }}>목표 출시</div>
                      <div style={{ fontWeight: 600 }}>
                        {p.target_date ? fmtDate(p.target_date) : "-"}
                        {overdue && <span className="badge owner" style={{ marginLeft: 6 }}>지연</span>}
                      </div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 11 }}>예상비용</div>
                      <div style={{ fontWeight: 600 }}>{p.cost_estimate != null ? p.cost_estimate.toLocaleString() : "-"}</div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 11 }}>단계</div>
                      <StageSelect id={p.id} stage={p.stage} />
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <ProductDevRowActions pd={p} brands={brands} vendors={vendors} users={users} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 출시 완료 */}
      {launched.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 20 }}>출시 완료 ({launched.length})</div>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>제품</th>
                  <th>브랜드</th>
                  <th>출시일</th>
                  <th>단계 변경</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {launched.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.brands?.name ?? "-"}</td>
                    <td>{p.launched_at ? fmtDate(p.launched_at) : "-"}</td>
                    <td><StageSelect id={p.id} stage={p.stage} /></td>
                    <td><ProductDevRowActions pd={p} brands={brands} vendors={vendors} users={users} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 보류 */}
      {held.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 20 }}>보류 ({held.length})</div>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>제품</th>
                  <th>브랜드</th>
                  <th>메모</th>
                  <th>단계 변경</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {held.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.brands?.name ?? "-"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{p.note ?? "-"}</td>
                    <td><StageSelect id={p.id} stage={p.stage} /></td>
                    <td><ProductDevRowActions pd={p} brands={brands} vendors={vendors} users={users} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
