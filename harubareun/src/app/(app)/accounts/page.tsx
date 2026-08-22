import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AccountsClient, { type Account } from "./AccountsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role !== "owner") redirect("/hub"); // 🔒 대표 전용

  let rows: Account[] = [];
  let dbReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("app_accounts")
      .select("id,service,purpose,login_id,password,url,note")
      .order("service", { ascending: true });
    if (error) dbReady = false;
    else
      rows = (data ?? []).map((r: any) => ({
        id: r.id,
        service: r.service ?? "",
        purpose: r.purpose ?? "",
        loginId: r.login_id ?? "",
        password: r.password ?? "",
        url: r.url ?? "",
        note: r.note ?? "",
      }));
  } catch {
    dbReady = false;
  }

  return <AccountsClient rows={rows} dbReady={dbReady} />;
}
