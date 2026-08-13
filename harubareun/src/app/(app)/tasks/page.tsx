import { createSupabaseServerClient } from "@/lib/supabase/server";
import NewTaskForm from "@/components/NewTaskForm";
import TaskStatusSelect from "@/components/TaskStatusSelect";
import { fmtDate, isOverdue } from "@/lib/time";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  title: string;
  category: string | null;
  status: string;
  due_date: string | null;
  wait_target: string | null;
  wait_reason: string | null;
  assignee_kind: string;
  brands: { name: string } | null;
  assignee: { name: string | null } | null;
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { brand?: string; assignee?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: brands }, { data: users }] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("users").select("id, name").neq("role", "ai").order("name"),
  ]);

  let query = supabase
    .from("tasks")
    .select(
      "id, title, category, status, due_date, wait_target, wait_reason, assignee_kind, brands(name), assignee:assignee_user_id(name)"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (searchParams.brand) query = query.eq("brand_id", searchParams.brand);
  if (searchParams.assignee)
    query = query.eq("assignee_user_id", searchParams.assignee);

  const { data } = await query;
  const rows = (data ?? []) as unknown as TaskRow[];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>업무 보드</h1>
          <p>대기 대상이 대표인 항목은 붉게 표시된다. 지연의 대부분은 회신 대기다.</p>
        </div>
        <NewTaskForm
          brands={(brands ?? []) as { id: string; name: string }[]}
          users={(users ?? []) as { id: string; name: string }[]}
        />
      </div>

      {/* 필터 */}
      <form method="get" className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ alignItems: "end" }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>브랜드</span>
            <select name="brand" defaultValue={searchParams.brand ?? ""}>
              <option value="">전체</option>
              {(brands ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>담당자</span>
            <select name="assignee" defaultValue={searchParams.assignee ?? ""}>
              <option value="">전체</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ flex: "0 0 auto" }}>
            <button className="btn">필터 적용</button>
          </div>
        </div>
      </form>

      <div className="card" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div className="empty">등록된 업무가 없습니다.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>브랜드</th>
                <th>업무</th>
                <th>담당</th>
                <th>카테고리</th>
                <th>상태</th>
                <th>목표일</th>
                <th>대기</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const waitOwner = (t.wait_target ?? "").includes("대표");
                const overdue = isOverdue(t.due_date, t.status);
                return (
                  <tr key={t.id} className={waitOwner ? "wait-owner" : ""}>
                    <td>{t.brands?.name ?? "-"}</td>
                    <td>{t.title}</td>
                    <td>
                      {t.assignee_kind === "ai"
                        ? "AI"
                        : t.assignee?.name ?? "미지정"}
                    </td>
                    <td>{t.category ?? "-"}</td>
                    <td>
                      <TaskStatusSelect taskId={t.id} status={t.status} />
                    </td>
                    <td>
                      {fmtDate(t.due_date)}
                      {overdue && (
                        <span className="badge owner" style={{ marginLeft: 6 }}>
                          지연
                        </span>
                      )}
                    </td>
                    <td>
                      {t.wait_target ? (
                        <span className={`badge ${waitOwner ? "owner" : ""}`}>
                          {t.wait_target}
                        </span>
                      ) : (
                        "-"
                      )}
                      {t.wait_reason ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {t.wait_reason}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
