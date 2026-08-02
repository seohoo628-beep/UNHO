import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PayablesClient, { type Payable } from "./PayablesClient";

export const dynamic = "force-dynamic";

const FULL = "id,counterparty,item,amount,paid,bill_date,due_date,note,principal,interest,component,frequency,period_amount,has_end,end_date";
const BASIC = "id,counterparty,item,amount,paid,bill_date,due_date,note";

function mapRow(r: any): Payable {
  return {
    id: r.id,
    counterparty: r.counterparty ?? "",
    item: r.item ?? "",
    amount: Number(r.amount) || 0,
    paid: Number(r.paid) || 0,
    billDate: r.bill_date ?? "",
    dueDate: r.due_date ?? "",
    note: r.note ?? "",
    principal: Number(r.principal) || 0,
    interest: Number(r.interest) || 0,
    component: r.component ?? "",
    frequency: r.frequency ?? "없음",
    periodAmount: Number(r.period_amount) || 0,
    hasEnd: !!r.has_end,
    endDate: r.end_date ?? "",
  };
}

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  let rows: Payable[] = [];
  let dbReady = true;
  let needsUpgrade = false;
  try {
    const supabase = createSupabaseServerClient();
    const full = await supabase.from("payables").select(FULL).order("due_date", { ascending: true, nullsFirst: false });
    if (full.error) {
      // 정기 지급 컬럼이 아직 없으면 기본 컬럼으로 폴백
      const basic = await supabase.from("payables").select(BASIC).order("due_date", { ascending: true, nullsFirst: false });
      if (basic.error) dbReady = false;
      else {
        needsUpgrade = true;
        rows = (basic.data ?? []).map(mapRow);
      }
    } else {
      rows = (full.data ?? []).map(mapRow);
    }
  } catch {
    dbReady = false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return <PayablesClient rows={rows} dbReady={dbReady} today={today} needsUpgrade={needsUpgrade} />;
}
