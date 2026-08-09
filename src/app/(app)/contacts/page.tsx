import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCeoUser } from "@/lib/ceo";
import ContactsClient, { type Contact } from "./ContactsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) redirect("/");

  const supabase = createSupabaseServerClient();
  let items: Contact[] = [];
  let dbReady = true;

  let res = await supabase
    .from("contacts")
    .select("id,name,category,job,title,company,contact,birthday,where_met,marital,has_children,children_names,note")
    .order("name", { ascending: true })
    .limit(1000);
  // category/title 컬럼이 아직 없으면(0060 미적용) 없이 재조회.
  if (res.error && res.error.code === "42703") {
    res = await supabase
      .from("contacts")
      .select("id,name,job,company,contact,birthday,where_met,marital,has_children,children_names,note")
      .order("name", { ascending: true })
      .limit(1000) as typeof res;
  }

  if (res.error && (res.error.code === "42P01" || /contacts/.test(res.error.message ?? ""))) {
    dbReady = false;
  } else if (!res.error) {
    items = (res.data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name ?? "",
      category: r.category ?? "",
      job: r.job ?? "",
      title: r.title ?? "",
      company: r.company ?? "",
      contact: r.contact ?? "",
      birthday: r.birthday ?? "",
      whereMet: r.where_met ?? "",
      marital: r.marital ?? "",
      hasChildren: !!r.has_children,
      childrenNames: r.children_names ?? "",
      note: r.note ?? "",
    }));
  }

  return <ContactsClient items={items} dbReady={dbReady} />;
}
