import { requireAppUser } from "@/lib/auth";
import { seoulToday } from "@/lib/time";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewFinance } from "@/lib/finance";
import ReceivablesClient, { type Receivable } from "./ReceivablesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  // 미수금은 CEO + psm 계정만 열람 가능.
  if (!canViewFinance(user)) redirect("/hub");

  const BASE = "id,counterparty,item,billed,received,bill_date,due_date,note";
  const TAX =
    ",supplier,vendor_id,supply_date,quantity,unit_price,supply_amount,tax_type,invoice_kind,invoice_no,invoice_issued_at";
  const mapRow = (r: any): Receivable => ({
    id: r.id,
    counterparty: r.counterparty ?? "",
    item: r.item ?? "",
    billed: Number(r.billed) || 0,
    received: Number(r.received) || 0,
    billDate: r.bill_date ?? "",
    dueDate: r.due_date ?? "",
    note: r.note ?? "",
    settledAt: r.settled_at ?? "",
    tax:
      r.tax_type === undefined
        ? undefined
        : {
            supplier: r.supplier ?? "",
            vendorId: r.vendor_id ?? "",
            supplyDate: r.supply_date ?? "",
            quantity: r.quantity != null ? Number(r.quantity) : null,
            unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
            supplyAmount: r.supply_amount != null ? Number(r.supply_amount) : null,
            taxType: r.tax_type ?? "과세",
            invoiceKind: r.invoice_kind ?? "청구",
            invoiceNo: r.invoice_no ?? "",
            invoiceIssuedAt: r.invoice_issued_at ?? "",
          },
  });

  let rows: Receivable[] = [];
  let dbReady = true;
  let settleReady = true;
  let taxReady = true;
  let vendors: { id: string; name: string }[] = [];
  try {
    const supabase = createSupabaseServerClient();
    const ord = { ascending: true, nullsFirst: false } as const;
    let full = await supabase.from("receivables").select(BASE + ",settled_at" + TAX).order("due_date", ord);
    if (full.error) {
      // 0097(세금계산서 항목) 미적용 — 기존 열로 다시 읽는다.
      taxReady = false;
      full = await supabase.from("receivables").select(BASE + ",settled_at").order("due_date", ord);
    }
    if (full.error) {
      settleReady = false;
      const basic = await supabase.from("receivables").select(BASE).order("due_date", ord);
      if (basic.error) dbReady = false;
      else rows = (basic.data ?? []).map(mapRow);
    } else {
      rows = (full.data ?? []).map(mapRow);
    }
    if (taxReady) {
      const v = await supabase.from("vendors").select("id,name").order("name");
      vendors = (v.data ?? []) as { id: string; name: string }[];
    }
  } catch {
    dbReady = false;
  }

  const today = seoulToday();
  return <ReceivablesClient rows={rows} dbReady={dbReady} today={today} settleReady={settleReady} taxReady={taxReady} vendors={vendors} />;
}
