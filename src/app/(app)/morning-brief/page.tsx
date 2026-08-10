import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCeoUser } from "@/lib/ceo";
import { seoulToday } from "@/lib/time";
import MorningBriefClient from "./MorningBriefClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) redirect("/");

  const supabase = createSupabaseServerClient();
  const today = seoulToday();
  let initialHtml = "";
  let initialDate = "";
  let pastDates: string[] = [];
  let dbReady = true;

  const res = await supabase
    .from("morning_briefs")
    .select("brief_date, html")
    .order("brief_date", { ascending: false })
    .limit(30);

  if (res.error && (res.error.code === "42P01" || /morning_briefs/.test(res.error.message ?? ""))) {
    dbReady = false;
  } else if (!res.error) {
    const rows = (res.data ?? []) as { brief_date: string; html: string }[];
    const todayRow = rows.find((r) => r.brief_date === today);
    if (todayRow) {
      initialHtml = todayRow.html;
      initialDate = today;
    } else if (rows[0]) {
      initialHtml = rows[0].html;
      initialDate = rows[0].brief_date;
    }
    pastDates = rows.map((r) => r.brief_date);
  }

  return <MorningBriefClient initialHtml={initialHtml} initialDate={initialDate} pastDates={pastDates} dbReady={dbReady} />;
}
