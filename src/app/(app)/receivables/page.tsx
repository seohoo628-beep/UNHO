import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ReceivablesClient, { type Receivable } from "./ReceivablesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  let rows: Receivable[] = [];
  let dbReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("receivables")
      .select("id,counterparty,item,billed,received,bill_date,due_date,note")
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) dbReady = false;
    else
      rows = (data ?? []).map((r: any) => ({
        id: r.id,
        counterparty: r.counterparty ?? "",
        item: r.item ?? "",
        billed: Number(r.billed) || 0,
        received: Number(r.received) || 0,
        billDate: r.bill_date ?? "",
        dueDate: r.due_date ?? "",
        note: r.note ?? "",
      }));
  } catch {
    dbReady = false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return <ReceivablesClient rows={rows} dbReady={dbReady} today={today} />;
}
