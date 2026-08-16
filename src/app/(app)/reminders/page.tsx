import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCeoUser } from "@/lib/ceo";
import RemindersClient, { type Reminder } from "./RemindersClient";

// 서버 컴포넌트라 "use client" 모듈(Checklist)의 함수를 직접 부르면 안 되므로 여기서 정규화.
function normChecklist(raw: unknown): { id: string; text: string; done: boolean; pinned?: boolean }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({ id: String(r?.id ?? ""), text: String(r?.text ?? "").trim(), done: !!r?.done, pinned: !!r?.pinned }))
    .filter((r) => r.id && r.text);
}

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) redirect("/");

  const supabase = createSupabaseServerClient();
  let items: Reminder[] = [];
  let dbReady = true;

  let res = await supabase
    .from("reminders")
    .select("*")
    .order("pinned", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(2000);
  // pinned/sort_order 컬럼 미적용(0070 전) 대비 폴백.
  if (res.error && !/does not exist|42P01/.test(res.error.message ?? "")) {
    res = await supabase.from("reminders").select("*").order("created_at", { ascending: true }).limit(2000) as typeof res;
  }

  if (res.error && (res.error.code === "42P01" || /reminders/.test(res.error.message ?? ""))) {
    dbReady = false;
  } else if (!res.error) {
    items = (res.data ?? []).map((r: any) => ({
      id: r.id,
      text: r.text ?? "",
      cat: r.cat ?? "",
      brand: r.brand ?? "",
      done: !!r.done,
      pinned: !!r.pinned,
      sortOrder: r.sort_order ?? 0,
      checklist: normChecklist(r.checklist),
    }));
  }

  return <RemindersClient items={items} dbReady={dbReady} />;
}
