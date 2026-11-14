import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";
import { seoulToday } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MdtAccount, MdtLot, MdtSale, MdtSettings, MdtShipment } from "@/lib/mudangtea";
import MudangteaClient from "./MudangteaClient";

export const dynamic = "force-dynamic";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export default async function Page() {
  const user = await requireAppUser();
  // 공급가·이익이 보이는 화면이라 대표·직원 중 재무 열람 권한자만.
  if ((user.role !== "owner" && user.role !== "staff") || !canViewFinance(user)) redirect("/login?e=forbidden");

  const supabase = createSupabaseServerClient();
  const [st, acc, lots, sales, ships] = await Promise.all([
    supabase.from("mdt_settings").select("*").eq("id", "main").maybeSingle(),
    supabase.from("mdt_accounts").select("*").order("created_at"),
    supabase.from("mdt_lots").select("*").order("expiry"),
    supabase.from("mdt_sales").select("*").order("sale_date", { ascending: false }),
    supabase.from("mdt_shipments").select("*").order("ship_date", { ascending: false }),
  ]);
  const dbReady = ![st, acc, lots, sales, ships].some((r) => r.error);

  const settings: MdtSettings | null = st.data
    ? {
        supplyPriceIncl: n(st.data.supply_price_incl),
        vatRate: Number(st.data.vat_rate ?? 0.1),
        retailPrice: n(st.data.retail_price),
        shipPerCarton: n(st.data.ship_per_carton),
        boxesPerCarton: n(st.data.boxes_per_carton),
      }
    : null;
  const accounts: MdtAccount[] = (acc.data ?? []).map((r) => ({
    id: r.id, name: s(r.name), channel: s(r.channel), stage: s(r.stage), dealType: s(r.deal_type), salePrice: n(r.sale_price),
    contact: s(r.contact), nextAction: s(r.next_action), nextDate: s(r.next_date), note: s(r.note),
  }));
  const lotRows: MdtLot[] = (lots.data ?? []).map((r) => ({ id: r.id, lotNo: s(r.lot_no), receivedDate: s(r.received_date), expiry: s(r.expiry), qtyIn: Number(r.qty_in) || 0, note: s(r.note) }));
  const saleRows: MdtSale[] = (sales.data ?? []).map((r) => ({
    id: r.id, saleDate: s(r.sale_date), accountId: s(r.account_id), lotId: s(r.lot_id), qty: Number(r.qty) || 0,
    unitPrice: Number(r.unit_price) || 0, shipCost: n(r.ship_cost), note: s(r.note),
  }));
  const shipRows: MdtShipment[] = (ships.data ?? []).map((r) => ({ id: r.id, shipDate: s(r.ship_date), kind: s(r.kind), accountId: s(r.account_id), cost: Number(r.cost) || 0, note: s(r.note) }));

  return (
    <div className="site">
      <header className="site-head">
        <div className="site-brand">
          <b>무당티</b>
          <span>유통 관리 · ㈜운호컴퍼니</span>
        </div>
        <div className="site-user">
          <span className="muted">{user.name || user.email}</span>
          <form action="/api/auth/signout" method="post">
            <button className="btn sm" type="submit">로그아웃</button>
          </form>
        </div>
      </header>
      <main className="site-main">
    <MudangteaClient
      dbReady={dbReady}
      today={seoulToday()}
      isOwner={user.role === "owner"}
      settings={settings}
      accounts={accounts}
      lots={lotRows}
      sales={saleRows}
      shipments={shipRows}
    />
      </main>
    </div>
  );
}
