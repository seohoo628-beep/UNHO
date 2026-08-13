import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { stockVerdict } from "@/lib/inventory";
import { fmtDate } from "@/lib/time";
import { VendorForm, POForm } from "@/components/VendorForms";
import POStatusSelect from "@/components/POStatusSelect";
import type { InventoryItem, PurchaseOrder, Vendor } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const [{ data: vendors }, { data: pos }, { data: inv }] = await Promise.all([
    supabase.from("vendors").select("*").order("name"),
    supabase
      .from("purchase_orders")
      .select("*, vendors(name), brands(name)")
      .order("po_date", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase.from("inventory_items").select("*, brands(name)").order("item"),
  ]);

  const vendorList = (vendors ?? []) as Vendor[];
  const poList = (pos ?? []) as unknown as (PurchaseOrder & {
    vendors: { name: string } | null;
    brands: { name: string } | null;
  })[];
  const invList = (inv ?? []) as unknown as (InventoryItem & {
    brands: { name: string } | null;
  })[];

  // 미지급: 입고완료·계산서수취 이면서 지급완료가 아닌 발주
  const unpaid = poList.filter(
    (p) => p.status === "입고완료" || p.status === "계산서수취"
  );
  // 재고 발주 임박/필요
  const reorder = invList
    .map((i) => ({ i, v: stockVerdict(i) }))
    .filter((x) => x.v.verdict === "발주 임박" || x.v.verdict === "발주 필요");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>거래처·발주</h1>
          <p>발주-입고-정산 대사와 재고 소진 판정. 금액은 대표 확정값만 입력한다.</p>
        </div>
        <div className="btn-row">
          <VendorForm />
          <POForm vendors={vendorList.map((v) => ({ id: v.id, name: v.name }))} />
        </div>
      </div>

      {/* 요약 */}
      <div className="grid cols-3" style={{ marginBottom: 8 }}>
        <div className="card">
          <div className="stat">
            <div className="lbl">거래처</div>
            <div className="n">{vendorList.length}</div>
          </div>
        </div>
        <div className="card">
          <div className="stat alert">
            <div className="lbl">발주 임박·필요 품목</div>
            <div className="n">{reorder.length}</div>
            <div className="decide">리드타임 안에 재고가 소진된다. 지금 발주 판단.</div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <div className="lbl">미지급 대사 대기</div>
            <div className="n">{unpaid.length}</div>
            <div className="decide">입고·계산서는 됐고 지급 전. 지급일을 확인한다.</div>
          </div>
        </div>
      </div>

      {/* 재고 소진 판정 */}
      <div className="section-title">재고 소진 판정</div>
      <div className="card" style={{ padding: 0 }}>
        {invList.length === 0 ? (
          <div className="empty">등록된 재고 품목이 없습니다.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>품목</th>
                <th>브랜드</th>
                <th>현재고</th>
                <th>일평균 출고</th>
                <th>소진일수</th>
                <th>발주 필요일</th>
                <th>판정</th>
              </tr>
            </thead>
            <tbody>
              {invList.map((i) => {
                const v = stockVerdict(i);
                const cls =
                  v.verdict === "발주 필요"
                    ? "owner"
                    : v.verdict === "발주 임박"
                    ? "warn"
                    : v.verdict === "여유"
                    ? "ok"
                    : "";
                return (
                  <tr key={i.id}>
                    <td>{i.item}</td>
                    <td>{i.brands?.name ?? "-"}</td>
                    <td>{i.current_stock ?? "-"}</td>
                    <td>{v.dailyOut ?? "-"}</td>
                    <td>{v.daysToEmpty ?? "-"}</td>
                    <td>{v.reorderDate ? fmtDate(v.reorderDate) : "-"}</td>
                    <td>
                      <span className={`badge ${cls}`}>{v.verdict}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 발주 대사 */}
      <div className="section-title">발주-입고-정산 대사</div>
      <div className="card" style={{ padding: 0 }}>
        {poList.length === 0 ? (
          <div className="empty">등록된 발주가 없습니다.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>발주번호</th>
                <th>발주일</th>
                <th>거래처</th>
                <th>품목</th>
                <th>수량</th>
                <th>단가</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {poList.map((p) => (
                <tr key={p.id}>
                  <td>{p.po_number ?? "-"}</td>
                  <td>{fmtDate(p.po_date)}</td>
                  <td>{p.vendors?.name ?? "-"}</td>
                  <td>{p.item ?? "-"}</td>
                  <td>{p.order_qty ?? "-"}</td>
                  <td>{p.unit_price != null ? p.unit_price.toLocaleString() : "[ 확인 필요 ]"}</td>
                  <td>
                    <POStatusSelect poId={p.id} status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 거래처 목록 */}
      <div className="section-title">거래처</div>
      <div className="card" style={{ padding: 0 }}>
        {vendorList.length === 0 ? (
          <div className="empty">등록된 거래처가 없습니다.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>코드</th>
                <th>거래처</th>
                <th>구분</th>
                <th>담당 브랜드</th>
                <th>결제조건</th>
                <th>리드타임</th>
                <th>MOQ</th>
                <th>계약</th>
              </tr>
            </thead>
            <tbody>
              {vendorList.map((v) => (
                <tr key={v.id}>
                  <td className="mono">{v.code ?? "-"}</td>
                  <td>{v.name}</td>
                  <td>{v.kind ?? "-"}</td>
                  <td>{v.brand_name ?? "-"}</td>
                  <td>{v.payment_terms ?? "-"}</td>
                  <td>{v.lead_time_days ?? "-"}</td>
                  <td>{v.moq ?? "-"}</td>
                  <td>{v.contract_status ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
