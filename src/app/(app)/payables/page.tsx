import { requireAppUser } from "@/lib/auth";
import { seoulToday } from "@/lib/time";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PayablesClient, { type Payable } from "./PayablesClient";

export const dynamic = "force-dynamic";

const FULL_BASE = "id,counterparty,item,amount,paid,bill_date,due_date,note,principal,interest,component,frequency,period_amount,has_end,end_date";
const FULL = FULL_BASE + ",settled_at";
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
    settledAt: r.settled_at ?? "",
  };
}

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  let rows: Payable[] = [];
  let dbReady = true;
  let needsUpgrade = false;
  let settleReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const ord = { ascending: true, nullsFirst: false } as const;
    const full = await supabase.from("payables").select(FULL).order("due_date", ord);
    if (full.error) {
      // settled_at 컬럼이 없으면 그것만 빼고 재시도
      settleReady = false;
      const full2 = await supabase.from("payables").select(FULL_BASE).order("due_date", ord);
      if (full2.error) {
        // 정기 지급 컬럼도 없으면 기본 컬럼으로 폴백
        const basic = await supabase.from("payables").select(BASIC).order("due_date", ord);
        if (basic.error) dbReady = false;
        else {
          needsUpgrade = true;
          rows = (basic.data ?? []).map(mapRow);
        }
      } else {
        rows = (full2.data ?? []).map(mapRow);
      }
    } else {
      rows = (full.data ?? []).map(mapRow);
    }
  } catch {
    dbReady = false;
  }

  const today = seoulToday();
  return <PayablesClient rows={rows} dbReady={dbReady} today={today} needsUpgrade={needsUpgrade} settleReady={settleReady} />;
}
