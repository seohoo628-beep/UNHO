import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCeoUser } from "@/lib/ceo";
import RemindersClient, { type Reminder } from "./RemindersClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) redirect("/");

  const supabase = createSupabaseServerClient();
  let items: Reminder[] = [];
  let dbReady = true;

  const res = await supabase
    .from("reminders")
    .select("*")
    .order("done", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(2000);

  if (res.error && (res.error.code === "42P01" || /reminders/.test(res.error.message ?? ""))) {
    dbReady = false;
  } else if (!res.error) {
    items = (res.data ?? []).map((r: any) => ({
      id: r.id,
      text: r.text ?? "",
      cat: r.cat ?? "",
      done: !!r.done,
    }));
  }

  return <RemindersClient items={items} dbReady={dbReady} />;
}
