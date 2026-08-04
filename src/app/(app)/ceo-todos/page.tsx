import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CeoTodosClient from "./CeoTodosClient";
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
  };
}

export default async function CeoTodosPage() {
  const user = await requireAppUser();
  if (user.role !== "owner") redirect("/");

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ceo_todos")
    .select("id,no,cat,text,pri,done,link,files,src,created_at")
    .order("created_at", { ascending: false });

  // 테이블이 아직 없으면(마이그레이션 미실행) DB 미준비 → 클라이언트가 localStorage로 동작.
  const dbReady = !error;
  const initial: CeoTodo[] = dbReady ? ((data as Row[]) ?? []).map(toTodo) : [];

  return <CeoTodosClient dbReady={dbReady} initial={initial} />;
}
