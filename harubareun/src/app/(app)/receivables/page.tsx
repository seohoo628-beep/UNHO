import { requireAppUser } from "@/lib/auth";
import { seoulToday } from "@/lib/time";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ReceivablesClient, { type Receivable } from "./ReceivablesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  const BASE = "id,counterparty,item,billed,received,bill_date,due_date,note";
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
  });

  let rows: Receivable[] = [];
  let dbReady = true;
  let settleReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const ord = { ascending: true, nullsFirst: false } as const;
    const full = await supabase.from("receivables").select(BASE + ",settled_at").order("due_date", ord);
    if (full.error) {
      settleReady = false;
      const basic = await supabase.from("receivables").select(BASE).order("due_date", ord);
      if (basic.error) dbReady = false;
      else rows = (basic.data ?? []).map(mapRow);
    } else {
      rows = (full.data ?? []).map(mapRow);
    }
  } catch {
    dbReady = false;
  }

  const today = seoulToday();
  return <ReceivablesClient rows={rows} dbReady={dbReady} today={today} settleReady={settleReady} />;
}
