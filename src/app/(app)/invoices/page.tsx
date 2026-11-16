import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";
import { isCeoUser } from "@/lib/ceo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import { getPopbillConfig } from "@/lib/popbill";
import { supplyOf, vatOf } from "@/lib/taxInvoice";
import { invoiceDeadline, daysBetween } from "@/lib/docs";
import InvoiceBoard, { type InvoiceRow } from "@/components/InvoiceBoard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 세금계산서 발행·관리: 미수금 장부(공급자 지정 건) 기준으로 미발행·발행·실패를 한곳에서 본다.
export default async function InvoicesPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (!canViewFinance(user)) redirect("/hub");
  const supabase = createSupabaseServerClient();
  const today = seoulToday();
  const sel = "id, counterparty, item, supplier, supply_date, bill_date, quantity, unit_price, supply_amount, tax_type, invoice_kind, invoice_no, invoice_issued_at, vendor_id";
  let res = await supabase.from("receivables").select(sel + ", invoice_issue_error").not("supplier", "is", null).order("supply_date", { ascending: false, nullsFirst: false }).limit(500);
  if (res.error) res = (await supabase.from("receivables").select(sel).not("supplier", "is", null).order("supply_date", { ascending: false, nullsFirst: false }).limit(500)) as typeof res;
  const ready = !res.error;

  const rows: InvoiceRow[] = ((res.data ?? []) as any[]).map((r) => {
    const supply = supplyOf({ supplyAmount: r.supply_amount, quantity: r.quantity, unitPrice: r.unit_price }) ?? 0;
    const tax = vatOf(supply, r.tax_type ?? "과세");
    const date = r.supply_date ?? r.bill_date ?? null;
    const deadline = date ? invoiceDeadline(date) : null;
    return {
      id: r.id,
      counterparty: r.counterparty,
      item: r.item ?? "",
      supplier: r.supplier,
      date,
      supply,
      tax,
      taxType: r.tax_type ?? "과세",
      kind: r.invoice_kind ?? "청구",
      invoiceNo: r.invoice_no ?? "",
      issuedAt: r.invoice_issued_at ?? "",
      error: r.invoice_issue_error ?? "",
      hasVendor: !!r.vendor_id,
      deadline,
      daysLeft: deadline ? daysBetween(today, deadline) : null,
    };
  });

  const cfg = isCeoUser(user) ? await getPopbillConfig().catch(() => null) : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>세금계산서 발행·관리</h1>
          <p>미수금 장부에서 공급자(운호컴퍼니·뷰티밤)를 지정한 건이 여기에 모입니다. 발급 기한은 공급일이 속한 달의 다음 달 10일입니다.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn primary" href="/receivables">+ 미수금에서 계산서 건 추가</Link>
          <Link className="btn" href="/settings">팝빌 설정</Link>
        </div>
      </div>
      {!ready && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn)", marginBottom: 14 }}>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>세금계산서 장부 컬럼이 없습니다. Supabase에서 0097_tax_invoice_ledger.sql을 실행하세요.</p>
        </div>
      )}
      <InvoiceBoard rows={rows} today={today} popbill={cfg ? { isTest: cfg.isTest } : null} />
    </div>
  );
}
