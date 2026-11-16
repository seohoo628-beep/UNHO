import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";
import { isCeoUser } from "@/lib/ceo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import { getPopbillConfig } from "@/lib/popbill";
import StatementsClient, { type Statement, type VendorInfo } from "@/components/StatementsClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function StatementsPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (!canViewFinance(user)) redirect("/hub");
  const supabase = createSupabaseServerClient();
  const [{ data, error }, { data: vendors }] = await Promise.all([
    supabase.from("trade_statements").select("*").order("issue_date", { ascending: false }).order("doc_no", { ascending: false }).limit(300),
    supabase.from("vendors").select("*").order("name"),
  ]);
  const cfg = isCeoUser(user) ? await getPopbillConfig().catch(() => null) : null;
  return (
    <StatementsClient
      ready={!error}
      today={seoulToday()}
      popbill={cfg ? { isTest: cfg.isTest } : null}
      vendors={((vendors ?? []) as any[]).map((v): VendorInfo => ({ id: v.id, name: v.name, bizNo: v.business_no ?? "", ceo: v.ceo ?? "", address: v.address ?? "", email: v.tax_email ?? v.email ?? "" }))}
      rows={((data ?? []) as any[]).map((s): Statement => ({
        id: s.id, docNo: s.doc_no, supplier: s.supplier, vendorId: s.vendor_id ?? "", receiverName: s.receiver_name, receiverBizNo: s.receiver_biz_no ?? "",
        receiverCeo: s.receiver_ceo ?? "", receiverAddress: s.receiver_address ?? "", receiverEmail: s.receiver_email ?? "", issueDate: s.issue_date,
        taxType: s.tax_type, note: s.note ?? "", status: s.status, total: Number(s.total) || 0, supplyTotal: Number(s.supply_total) || 0, taxTotal: Number(s.tax_total) || 0,
        items: (Array.isArray(s.items) ? s.items : []).map((i: any) => ({ name: i.name ?? "", spec: i.spec ?? "", qty: i.qty != null ? String(i.qty) : "", unit_price: i.unit_price != null ? String(i.unit_price) : "", supply: String(i.supply ?? "") })),
      }))}
    />
  );
}
