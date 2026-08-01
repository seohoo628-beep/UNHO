import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import LeaveClient, { type Leave } from "./LeaveClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  let rows: Leave[] = [];
  let dbReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("leave_requests")
      .select("id,name,type,start_date,end_date,days,reason,status")
      .order("start_date", { ascending: false });
    if (error) dbReady = false;
    else
      rows = (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name ?? "",
        type: r.type ?? "연차",
        start: r.start_date ?? "",
        end: r.end_date ?? "",
        days: Number(r.days) || 0,
        reason: r.reason ?? "",
        status: r.status ?? "신청",
      }));
  } catch {
    dbReady = false;
  }

  return <LeaveClient rows={rows} dbReady={dbReady} />;
}
