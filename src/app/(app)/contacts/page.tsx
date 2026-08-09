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

  // select * 로 조회 → 아직 없는 컬럼(마이그레이션 전)이 있어도 안전.
  const res = await supabase
    .from("contacts")
    .select("*")
    .order("name", { ascending: true })
    .limit(2000);

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
      agency: r.agency ?? "",
      groupWork: r.group_work ?? "",
      contact: r.contact ?? "",
      contact2: r.contact2 ?? "",
      email: r.email ?? "",
      birthday: r.birthday ?? "",
      birthYear: r.birth_year ?? null,
      hometown: r.hometown ?? "",
      education: r.education ?? "",
      address: r.address ?? "",
      whereMet: r.where_met ?? "",
      marital: r.marital ?? "",
      hasChildren: !!r.has_children,
      childrenNames: r.children_names ?? "",
      note: r.note ?? "",
    }));
  }

  return <ContactsClient items={items} dbReady={dbReady} />;
}
