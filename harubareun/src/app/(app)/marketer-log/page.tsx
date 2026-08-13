import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import MarketerLogClient, { type MarketerLog } from "./MarketerLogClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");

  const supabase = createSupabaseServerClient();
  let logs: MarketerLog[] = [];
  let users: { id: string; name: string }[] = [];
  let dbReady = true;

  const [logRes, userRes] = await Promise.all([
    supabase
      .from("marketer_logs")
      .select("id,kind,log_date,title,note,files,users:author_user_id(name)")
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("users").select("id, name").neq("role", "ai").neq("role", "guest").order("name"),
  ]);

  if (logRes.error && (logRes.error.code === "42P01" || /marketer_logs/.test(logRes.error.message ?? ""))) {
    dbReady = false;
  } else if (!logRes.error) {
    logs = (logRes.data ?? []).map((r: any) => ({
      id: r.id,
      kind: r.kind ?? "일일업무일지",
      logDate: r.log_date ?? "",
      title: r.title ?? "",
      note: r.note ?? "",
      files: Array.isArray(r.files) ? r.files : [],
      authorName: r.users?.name ?? "",
    }));
  }
  users = (userRes.data ?? []) as { id: string; name: string }[];

  return <MarketerLogClient logs={logs} users={users} today={seoulToday()} dbReady={dbReady} />;
}
