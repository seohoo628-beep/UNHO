import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCeoUser } from "@/lib/ceo";
import AntiagingClient, { type Log } from "./AntiagingClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) redirect("/");

  const supabase = createSupabaseServerClient();
  let items: Log[] = [];
  let dbReady = true;

  const res = await supabase
    .from("antiaging_logs")
    .select("*")
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);

  if (res.error && (res.error.code === "42P01" || /antiaging_logs/.test(res.error.message ?? ""))) {
    dbReady = false;
  } else if (!res.error) {
    items = (res.data ?? []).map((r: any) => ({
      id: r.id,
      kind: r.kind ?? "시술",
      logDate: r.log_date ?? "",
      hospital: r.hospital ?? "",
      treatment: r.treatment ?? "",
      doctor: r.doctor ?? "",
      area: r.area ?? "",
      cost: r.cost ?? null,
      nextDate: r.next_date ?? "",
      note: r.note ?? "",
    }));
  }

  return <AntiagingClient items={items} dbReady={dbReady} />;
}
