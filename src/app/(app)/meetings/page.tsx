import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import MeetingsClient, { type Meeting } from "./MeetingsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  let rows: Meeting[] = [];
  let dbReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("meetings")
      .select("id,title,meeting_type,meeting_date,attendees,location,body,ai_summary,file_path,file_name")
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) dbReady = false;
    else
      rows = (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title ?? "",
        meetingType: r.meeting_type ?? "내부",
        meetingDate: r.meeting_date ?? "",
        attendees: r.attendees ?? "",
        location: r.location ?? "",
        body: r.body ?? "",
        aiSummary: r.ai_summary ?? "",
        filePath: r.file_path ?? "",
        fileName: r.file_name ?? "",
      }));
  } catch {
    dbReady = false;
  }

  const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/`;
  const today = new Date().toISOString().slice(0, 10);
  return <MeetingsClient rows={rows} dbReady={dbReady} publicBase={publicBase} today={today} />;
}
