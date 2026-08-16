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
  brand?: string | null;
  text: string;
  pri: string | null;
  done: boolean | null;
  link: string | null;
  files: { url: string; name: string }[] | null;
  src: string | null;
  due_date?: string | null;
  sort_order?: number | null;
  pinned?: boolean | null;
  checklist?: { id: string; text: string; done: boolean }[] | null;
};

function toTodo(r: Row): CeoTodo {
  return {
    id: r.id,
    no: r.no ?? undefined,
    cat: r.cat ?? undefined,
    brand: r.brand ?? undefined,
    text: r.text,
    pri: (r.pri as Pri) ?? "최우선",
    done: !!r.done,
    src: r.src ?? undefined,
    link: r.link ?? undefined,
    files: Array.isArray(r.files) && r.files.length ? r.files : undefined,
    dueDate: r.due_date ?? undefined,
    sortOrder: r.sort_order ?? 0,
    pinned: !!r.pinned,
    checklist: Array.isArray(r.checklist) ? r.checklist : undefined,
  };
}

export default async function CeoTodosPage() {
  const user = await requireAppUser();
  if (!isCeoUser(user)) redirect("/");

  const supabase = createSupabaseServerClient();
  // sort_order 있으면 그 순서로, 없으면(마이그레이션 전) created_at 순으로.
  const ordered = (sel: string) => supabase
    .from("ceo_todos")
    .select(sel)
    .order("pinned", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  // checklist 포함 → (없으면) 미포함 → (그래도 실패면) 최소 컬럼
  let res = await ordered("id,no,cat,brand,text,pri,done,link,files,src,due_date,sort_order,pinned,checklist,created_at");
  if (res.error) res = await ordered("id,no,cat,brand,text,pri,done,link,files,src,due_date,sort_order,pinned,created_at");
  if (res.error) {
    res = (await supabase
      .from("ceo_todos")
      .select("id,no,cat,text,pri,done,link,files,src,created_at")
      .order("created_at", { ascending: false })) as typeof res;
  }

  // 테이블이 아직 없으면(마이그레이션 미실행) DB 미준비 → 클라이언트가 localStorage로 동작.
  const dbReady = !res.error;
  const initial: CeoTodo[] = dbReady ? ((res.data as unknown as Row[]) ?? []).map(toTodo) : [];

  const mandalart = await loadMandalart();

  return (
    <>
      <div
        className="card"
        style={{
          padding: "14px 18px",
          marginBottom: 14,
          textAlign: "center",
          background: "linear-gradient(120deg, #fef3c7, #fde68a)",
          border: "1px solid #f59e0b",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#92400e", marginBottom: 4 }}>
          인생 슬로건
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#78350f", letterSpacing: "-0.01em" }}>
          문제 해결! 회피 금지!
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#b91c1c", marginTop: 5 }}>
          성과 = 매출. 매출이 없는 노력은 성과가 아니다.
        </div>
      </div>
      <Mandalart initialCells={mandalart.cells} dbReady={mandalart.dbReady} />
      <CeoTodosClient dbReady={dbReady} initial={initial} />
    </>
  );
}
