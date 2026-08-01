import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtDate, isOverdue } from "@/lib/time";
import TodoForm from "@/components/TodoForm";
import TodoRow, { TodoData } from "@/components/TodoRow";
import QuickTodoAdd from "@/components/QuickTodoAdd";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  ref_link: string | null;
  note: string | null;
  brand_id: string | null;
  assignee_user_id: string | null;
  brands: { name: string } | null;
  assignee: { name: string | null } | null;
};

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
        "id, title, status, priority, due_date, ref_link, note, brand_id, assignee_user_id, brands(name), assignee:assignee_user_id(name)"
      )
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const brandOpts = (brands ?? []) as { id: string; name: string }[];
  const userOpts = (users ?? []) as { id: string; name: string }[];
  const rows = (todos ?? []) as unknown as Row[];

  const toData = (t: Row, closedView: boolean): TodoData => ({
    id: t.id,
    title: t.title,
    note: t.note,
    brandId: t.brand_id,
    brandName: t.brands?.name ?? null,
    assigneeId: t.assignee_user_id,
    assigneeName: t.assignee?.name ?? null,
    priority: t.priority,
    dueDate: t.due_date,
    dueLabel: fmtDate(t.due_date),
    status: t.status,
    refLink: t.ref_link,
    overdue: !closedView && isOverdue(t.due_date, t.status),
  });

  const PRIO_ORDER: Record<string, number> = { 높음: 0, 보통: 1, 낮음: 2 };
  const active = rows
    .filter((t) => t.status === "예정" || t.status === "진행")
    .sort((a, b) => (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1));
  const closed = rows.filter((t) => ["완료", "보류", "취소"].includes(t.status));

  // 담당자별 그룹 + 색상(이름 해시로 팔레트 지정, 미지정은 회색)
  const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
  const colorFor = (name: string) => {
    if (name === "미지정") return "#94a3b8";
    let h = 0;
    for (const c of name) h = (h + c.charCodeAt(0)) % 9973;
    return PALETTE[h % PALETTE.length];
  };
  const groupMap = new Map<string, Row[]>();
  for (const t of active) {
    const name = t.assignee?.name ?? "미지정";
    if (!groupMap.has(name)) groupMap.set(name, []);
    groupMap.get(name)!.push(t);
  }
  const groups = [...groupMap.entries()].sort((a, b) => {
    if (a[0] === "미지정") return 1;
    if (b[0] === "미지정") return -1;
    return a[0].localeCompare(b[0]);
  });

  const Table = ({ list, closedView }: { list: Row[]; closedView?: boolean }) => (
    <table className="tbl">
      <thead>
        <tr>
          <th>브랜드</th>
          <th>업무</th>
          <th>담당</th>
          <th>중요도</th>
          <th>마감</th>
          <th>참고</th>
          <th>진행상태</th>
        </tr>
      </thead>
      <tbody>
        {list.map((t) => (
          <TodoRow key={t.id} todo={toData(t, !!closedView)} brands={brandOpts} users={userOpts} />
        ))}
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
        <TodoForm brands={brandOpts} users={userOpts} />
      </div>

      <div className="section-title">진행 중 ({active.length}) · 담당자별</div>
      {active.length === 0 ? (
        <div className="card">
          <div className="empty">진행 중인 할 일이 없습니다. 아래 &ldquo;+ 빠른 추가&rdquo;로 바로 등록하세요.</div>
        </div>
      ) : (
        groups.map(([name, list]) => {
          const color = colorFor(name);
          return (
            <div
              key={name}
              className="card"
              style={{ padding: 0, overflow: "hidden", marginBottom: 12, borderLeft: `4px solid ${color}` }}
            >
              <div
                style={{
                  padding: "9px 14px",
                  background: `${color}14`,
                  fontWeight: 600,
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
                {name}
                <span className="muted" style={{ fontWeight: 400 }}>· {list.length}건</span>
              </div>
              <Table list={list} />
            </div>
          );
        })
      )}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <QuickTodoAdd brands={brandOpts} users={userOpts} />
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
