import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtDate, isOverdue } from "@/lib/time";
import TodoForm from "@/components/TodoForm";
import TodoRowActions from "@/components/TodoRowActions";

export const dynamic = "force-dynamic";

type TodoRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  ref_link: string | null;
  note: string | null;
  brands: { name: string } | null;
  assignee: { name: string | null } | null;
};

const PRIO_BADGE: Record<string, string> = { 높음: "owner", 보통: "", 낮음: "muted" };

export default async function TodosPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const [{ data: brands }, { data: users }, { data: todos }] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("users").select("id, name").neq("role", "ai").order("name"),
    supabase
      .from("todos")
      .select(
        "id, title, status, priority, due_date, ref_link, note, brands(name), assignee:assignee_user_id(name)"
      )
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const rows = (todos ?? []) as unknown as TodoRow[];
  const PRIO_ORDER: Record<string, number> = { 높음: 0, 보통: 1, 낮음: 2 };
  const active = rows
    .filter((t) => t.status === "예정" || t.status === "진행")
    .sort((a, b) => (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1));
  const closed = rows.filter((t) => ["완료", "보류", "취소"].includes(t.status));

  const Table = ({ list, closedView }: { list: TodoRow[]; closedView?: boolean }) => (
    <table className="tbl">
      <thead>
        <tr>
          <th>브랜드</th>
          <th>업무</th>
          <th>담당</th>
          <th>중요도</th>
          <th>마감</th>
          <th>참고</th>
          <th>{closedView ? "상태" : "진행상태"}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((t) => {
          const overdue = !closedView && isOverdue(t.due_date, t.status);
          return (
            <tr key={t.id}>
              <td>{t.brands?.name ?? "-"}</td>
              <td>
                {t.title}
                {t.note ? <div className="muted" style={{ fontSize: 12 }}>{t.note}</div> : null}
              </td>
              <td>{t.assignee?.name ?? "미지정"}</td>
              <td>
                <span className={`badge ${PRIO_BADGE[t.priority] ?? ""}`}>{t.priority}</span>
              </td>
              <td>
                {fmtDate(t.due_date)}
                {overdue && <span className="badge owner" style={{ marginLeft: 6 }}>지연</span>}
              </td>
              <td>
                {t.ref_link ? (
                  <a href={t.ref_link} target="_blank" rel="noreferrer" className="btn sm">
                    열기
                  </a>
                ) : (
                  "-"
                )}
              </td>
              <td>
                <TodoRowActions id={t.id} status={t.status} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>업무 투두</h1>
          <p>할 일을 입력하고 진행상태로 팔로업한다. 보류·완료·취소는 아래 &ldquo;완료된 업무&rdquo;로 넘어간다.</p>
        </div>
        <TodoForm
          brands={(brands ?? []) as { id: string; name: string }[]}
          users={(users ?? []) as { id: string; name: string }[]}
        />
      </div>

      <div className="section-title">진행 중 ({active.length})</div>
      <div className="card" style={{ padding: 0 }}>
        {active.length === 0 ? (
          <div className="empty">진행 중인 할 일이 없습니다. &ldquo;할 일 추가&rdquo;로 등록하세요.</div>
        ) : (
          <Table list={active} />
        )}
      </div>

      <div className="section-title">완료된 업무 ({closed.length})</div>
      <div className="card" style={{ padding: 0 }}>
        {closed.length === 0 ? (
          <div className="empty">아직 없습니다.</div>
        ) : (
          <Table list={closed} closedView />
        )}
      </div>
    </div>
  );
}
