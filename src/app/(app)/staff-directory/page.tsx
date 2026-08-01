import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import StaffClient, { type Emp } from "./StaffClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  let rows: Emp[] = [];
  let dbReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("staff_directory")
      .select("id,name,position,hire_date,salary,phone,note")
      .order("hire_date", { ascending: true });
    if (error) dbReady = false;
    else
      rows = (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name ?? "",
        position: r.position ?? "",
        hireDate: r.hire_date ?? "",
        salary: r.salary ?? 0,
        phone: r.phone ?? "",
        note: r.note ?? "",
      }));
  } catch {
    dbReady = false;
  }

  return <StaffClient rows={rows} dbReady={dbReady} />;
}
