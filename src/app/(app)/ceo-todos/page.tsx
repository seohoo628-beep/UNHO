import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CeoTodosClient from "./CeoTodosClient";
import Mandalart from "@/components/Mandalart";
import { loadMandalart } from "./mandalart-actions";
import { isCeoUser } from "@/lib/ceo";
import type { CeoTodo, Pri } from "./data";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  no: number | null;
  cat: string | null;
  text: string;
  pri: string | null;
  done: boolean | null;
  link: string | null;
  files: { url: string; name: string }[] | null;
  src: string | null;
  due_date?: string | null;
  sort_order?: number | null;
  pinned?: boolean | null;
};

function toTodo(r: Row): CeoTodo {
  return {
    id: r.id,
    no: r.no ?? undefined,
    cat: r.cat ?? undefined,
    text: r.text,
    pri: (r.pri as Pri) ?? "최우선",
    done: !!r.done,
    src: r.src ?? undefined,
    link: r.link ?? undefined,
    files: Array.isArray(r.files) && r.files.length ? r.files : undefined,
    dueDate: r.due_date ?? undefined,
    sortOrder: r.sort_order ?? 0,
    pinned: !!r.pinned,
  };
}

export default async function CeoTodosPage() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) redirect("/");

  const supabase = createSupabaseServerClient();
  // sort_order 있으면 그 순서로, 없으면(마이그레이션 전) created_at 순으로.
  let res = await supabase
    .from("ceo_todos")
    .select("id,no,cat,text,pri,done,link,files,src,due_date,sort_order,pinned,created_at")
    .order("pinned", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (res.error) {
    res = (await supabase
      .from("ceo_todos")
      .select("id,no,cat,text,pri,done,link,files,src,created_at")
      .order("created_at", { ascending: false })) as typeof res;
  }

  // 테이블이 아직 없으면(마이그레이션 미실행) DB 미준비 → 클라이언트가 localStorage로 동작.
  const dbReady = !res.error;
  const initial: CeoTodo[] = dbReady ? ((res.data as Row[]) ?? []).map(toTodo) : [];

  const mandalart = await loadMandalart();

  return (
    <>
      <Mandalart initialCells={mandalart.cells} dbReady={mandalart.dbReady} />
      <CeoTodosClient dbReady={dbReady} initial={initial} />
    </>
  );
}
