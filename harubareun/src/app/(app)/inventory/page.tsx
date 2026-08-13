import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getScopeBrandId } from "@/lib/brandScope";
import { stockVerdict } from "@/lib/inventory";
import { fmtDate, seoulToday } from "@/lib/time";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { InventoryItemForm, InventoryRowActions } from "@/components/InventoryForms";
import type { InventoryItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const SETUP_SQL = `-- 재고 이동(입고/출고) 기록
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.inventory_items(id) on delete cascade,
  kind text not null default 'out' check (kind in ('in','out','adjust')),
  qty numeric not null default 0,
  balance numeric,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.inventory_movements enable row level security;
drop policy if exists inv_mov_all on public.inventory_movements;
create policy inv_mov_all on public.inventory_movements for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`;

const VERDICT_CLS: Record<string, string> = {
  "발주 필요": "owner",
  "발주 임박": "warn",
  여유: "ok",
  "데이터 부족": "",
};

// 유효기간 판정: 지났으면 만료, 30일 이내면 임박.
function expiryStatus(expiry: string | null, today: string): { label: string; cls: string; days: number } | null {
  if (!expiry) return null;
  const days = Math.round((new Date(expiry + "T00:00:00+09:00").getTime() - new Date(today + "T00:00:00+09:00").getTime()) / 86400000);
  if (days < 0) return { label: "만료", cls: "owner", days };
  if (days <= 30) return { label: `D-${days}`, cls: "warn", days };
  return { label: `D-${days}`, cls: "", days };
}

export default async function InventoryPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();
  const scopeId = await getScopeBrandId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byBrand = (q: any) => (scopeId ? q.eq("brand_id", scopeId) : q);

  const [{ data: brandsRaw }, { data: vendorsRaw }, invRes] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("vendors").select("id, name").order("name"),
    byBrand(supabase.from("inventory_items").select("*, brands(name), vendors(name)")).order("item"),
  ]);

  // inventory_items 테이블 자체가 없으면 설정 안내
  if (invRes.error && (invRes.error.code === "42P01" || /inventory_items/.test(invRes.error.message ?? ""))) {
    return (
      <div>
        <div className="page-head">
          <h1>재고관리</h1>
        </div>
        <DbSetupNotice title="재고관리" sql={SETUP_SQL} />
      </div>
    );
  }

  const brands = (brandsRaw ?? []) as { id: string; name: string }[];
  const vendors = (vendorsRaw ?? []) as { id: string; name: string }[];
  const invList = (invRes.data ?? []) as unknown as (InventoryItem & {
    brands: { name: string } | null;
    vendors: { name: string } | null;
  })[];

  const today = seoulToday();
  const verdicts = invList.map((i) => ({ i, v: stockVerdict(i), e: expiryStatus(i.expiry_date, today) }));
  const reorder = verdicts.filter((x) => x.v.verdict === "발주 필요" || x.v.verdict === "발주 임박");
  const expiring = verdicts.filter((x) => x.e && x.e.days <= 30);
  const totalStock = invList.reduce((s, i) => s + (Number(i.current_stock) || 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>재고관리</h1>
          <p>품목별 현재고와 소진 판정. 입고·출고를 바로 반영하고 발주 시점을 놓치지 않는다.</p>
        </div>
        <InventoryItemForm brands={brands} vendors={vendors} />
      </div>

      {/* 요약 */}
      <div className="grid cols-3" style={{ marginBottom: 8 }}>
        <div className="card">
          <div className="stat">
            <div className="lbl">등록 품목</div>
            <div className="n">{invList.length}</div>
          </div>
        </div>
        <div className="card">
          <div className="stat alert">
            <div className="lbl">발주 임박·필요</div>
            <div className="n">{reorder.length}</div>
            <div className="decide">리드타임 안에 소진 예상. 지금 발주 판단.</div>
          </div>
        </div>
        <div className="card">
          <div className="stat alert">
            <div className="lbl">유효기간 임박·만료</div>
            <div className="n">{expiring.length}</div>
            <div className="decide">30일 이내 만료 예정. 소진·폐기 판단.</div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="lbl">총 재고 수량</div>
            <div className="n">{totalStock.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* 발주 필요 우선 알림 */}
      {reorder.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid var(--owner)", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>⚠ 발주 판단 필요 ({reorder.length})</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {reorder.map(({ i, v }) => (
              <span key={i.id} className={`badge ${VERDICT_CLS[v.verdict] ?? ""}`}>
                {i.item} · {v.verdict}
                {v.reorderDate ? ` (${fmtDate(v.reorderDate)})` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 유효기간 임박·만료 알림 */}
      {expiring.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn, #f59e0b)", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>⏳ 유효기간 확인 필요 ({expiring.length})</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {expiring.map(({ i, e }) => (
              <span key={i.id} className={`badge ${e!.cls}`}>
                {i.item} · {e!.label === "만료" ? "만료" : `${e!.label}`} ({i.expiry_date ? fmtDate(i.expiry_date) : ""})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 품목 카드 목록 */}
      <div className="section-title">품목 ({invList.length})</div>
      {invList.length === 0 ? (
        <div className="card">
          <div className="empty">등록된 품목이 없습니다. &ldquo;+ 품목 등록&rdquo;으로 추가하세요.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {verdicts.map(({ i, v, e }) => (
            <div key={i.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {i.item}
                    <span className={`badge ${VERDICT_CLS[v.verdict] ?? ""}`}>{v.verdict}</span>
                    {e && (e.days <= 30 || e.days < 0) && (
                      <span className={`badge ${e.cls}`}>{e.label === "만료" ? "유효기간 만료" : `유효기간 ${e.label}`}</span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {i.brands?.name ?? "브랜드 미지정"}
                    {i.vendors?.name ? ` · 공급 ${i.vendors.name}` : ""}
                    {i.note ? ` · ${i.note}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                  <div>
                    <div className="muted" style={{ fontSize: 11 }}>현재고</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{i.current_stock ?? "-"}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11 }}>일평균 출고</div>
                    <div style={{ fontWeight: 600 }}>{v.dailyOut ?? "-"}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11 }}>소진일수</div>
                    <div style={{ fontWeight: 600 }}>{v.daysToEmpty ?? "-"}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11 }}>발주 필요일</div>
                    <div style={{ fontWeight: 600 }}>{v.reorderDate ? fmtDate(v.reorderDate) : "-"}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11 }}>생산일</div>
                    <div style={{ fontWeight: 600 }}>{i.production_date ? fmtDate(i.production_date) : "-"}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11 }}>유효기간</div>
                    <div style={{ fontWeight: 600, color: e && e.days < 0 ? "var(--owner)" : undefined }}>
                      {i.expiry_date ? fmtDate(i.expiry_date) : "-"}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <InventoryRowActions item={i} brands={brands} vendors={vendors} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
