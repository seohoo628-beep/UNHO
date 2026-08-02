import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PayablesClient, { type Payable } from "./PayablesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  let rows: Payable[] = [];
  let dbReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("payables")
      .select("id,counterparty,item,amount,paid,bill_date,due_date,note")
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) dbReady = false;
    else
      rows = (data ?? []).map((r: any) => ({
        id: r.id,
        counterparty: r.counterparty ?? "",
        item: r.item ?? "",
        amount: Number(r.amount) || 0,
        paid: Number(r.paid) || 0,
        billDate: r.bill_date ?? "",
        dueDate: r.due_date ?? "",
        note: r.note ?? "",
      }));
  } catch {
    dbReady = false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return <PayablesClient rows={rows} dbReady={dbReady} today={today} />;
}
