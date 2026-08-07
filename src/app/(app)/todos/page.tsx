import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtDate, isOverdue } from "@/lib/time";
import TodoForm from "@/components/TodoForm";
import TodoRow, { TodoData } from "@/components/TodoRow";
import QuickTodoAdd from "@/components/QuickTodoAdd";
import CeoMigrateButton from "@/components/CeoMigrateButton";
import TodoKakaoSummary, { type KakaoSumGroup } from "@/components/TodoKakaoSummary";

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
  assignee_user_ids: string[] | null;
  file_url: string | null;
  file_name: string | null;
  files: { url: string; name: string }[] | null;
  sort_order: number | null;
  brands: { name: string } | null;
};

const MIGRATE_SQL = `-- 다중 담당자
alter table public.todos
  add column if not exists assignee_user_ids uuid[] not null default '{}'::uuid[];
update public.todos set assignee_user_ids = array[assignee_user_id]
  where assignee_user_id is not null and coalesce(cardinality(assignee_user_ids),0)=0;
create index if not exists idx_todos_assignees on public.todos using gin(assignee_user_ids);
-- 파일 첨부(다중)
alter table public.todos
  add column if not exists files jsonb not null default '[]'::jsonb;
-- 수동 정렬(위/아래 이동)
alter table public.todos
  add column if not exists sort_order int not null default 0;`;

export default async function TodosPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const supabase = createSupabaseServerClient();

  const [{ data: brands }, { data: users }] = await Promise.all([
    supabase.from("brands").select("id, name").order("name"),
    supabase.from("users").select("id, name").neq("role", "ai").order("name"),
  ]);

  // 다중 담당자 컬럼이 있으면 함께 읽고, 아직 없으면(마이그레이션 전) 단일 컬럼만 읽는다.
  const selMulti =
    "id, title, status, priority, due_date, ref_link, note, brand_id, assignee_user_id, assignee_user_ids, file_url, file_name, files, sort_order, brands(name)";
  const selSingle =
    "id, title, status, priority, due_date, ref_link, note, brand_id, assignee_user_id, brands(name)";
  let needsMigration = false;
  const resMulti = await supabase
    .from("todos")
    .select(selMulti)
    .order("created_at", { ascending: false })
    .limit(400);
  let todos = resMulti.data as unknown as Row[] | null;
  if (resMulti.error) {
    needsMigration = true;
    const resSingle = await supabase
      .from("todos")
      .select(selSingle)
      .order("created_at", { ascending: false })
      .limit(400);
    todos = resSingle.data as unknown as Row[] | null;
  }

  const brandOpts = (brands ?? []) as { id: string; name: string }[];
  const userOpts = (users ?? []) as { id: string; name: string }[];
  const userName = new Map(userOpts.map((u) => [u.id, u.name] as const));
  const rows = (todos ?? []) as Row[];

  const idsOf = (t: Row): string[] => {
    const arr = t.assignee_user_ids && t.assignee_user_ids.length ? t.assignee_user_ids : [];
    if (arr.length) return arr;
    return t.assignee_user_id ? [t.assignee_user_id] : [];
  };
  const namesOf = (t: Row): string[] => idsOf(t).map((id) => userName.get(id)).filter(Boolean) as string[];

  const toData = (t: Row, closedView: boolean): TodoData => ({
    id: t.id,
    title: t.title,
    note: t.note,
    brandId: t.brand_id,
    brandName: t.brands?.name ?? null,
    assigneeIds: idsOf(t),
    assigneeNames: namesOf(t),
    priority: t.priority,
    dueDate: t.due_date,
    dueLabel: fmtDate(t.due_date),
    status: t.status,
    refLink: t.ref_link,
    files:
      t.files && t.files.length
        ? t.files
        : t.file_url
        ? [{ url: t.file_url, name: t.file_name ?? "파일" }]
        : [],
    overdue: !closedView && isOverdue(t.due_date, t.status),
  });

  const PRIO_ORDER: Record<string, number> = { 높음: 0, 보통: 1, 낮음: 2 };
  const active = rows
    .filter((t) => t.status === "예정" || t.status === "진행")
    .sort(
      (a, b) =>
        (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
  const closed = rows.filter((t) => ["완료", "보류", "취소"].includes(t.status));

  // 담당자별 그룹 + 색상(이름 해시로 팔레트 지정, 미지정은 회색). 다중 담당은 여러 그룹에 노출.
  const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
  const colorFor = (name: string) => {
    if (name === "미지정") return "#94a3b8";
    let h = 0;
    for (const c of name) h = (h + c.charCodeAt(0)) % 9973;
    return PALETTE[h % PALETTE.length];
  };
  const groupMap = new Map<string, Row[]>();
  for (const t of active) {
    const names = namesOf(t);
    const keys = names.length ? names : ["미지정"];
    for (const name of keys) {
      if (!groupMap.has(name)) groupMap.set(name, []);
      groupMap.get(name)!.push(t);
    }
  }
  const groups = [...groupMap.entries()].sort((a, b) => {
    if (a[0] === "미지정") return 1;
    if (b[0] === "미지정") return -1;
    return a[0].localeCompare(b[0]);
  });

  // 카톡 리마인드용 요약(담당자별 진행 중 업무). 중요도 순 정렬.
  const kakaoGroups: KakaoSumGroup[] = groups.map(([name, list]) => ({
    name,
    items: [...list]
      .sort((a, b) => (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1))
      .map((t) => ({
        title: t.title,
        brand: t.brands?.name ?? null,
        priority: t.priority,
        due: t.due_date ? fmtDate(t.due_date) : null,
        overdue: isOverdue(t.due_date, t.status),
      })),
  }));
  const todayStr = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

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
        {list.map((t) => {
          // 같은 그룹·같은 우선순위 형제 순서(위/아래 이동용). 완료 목록은 미노출.
          const reorderIds = closedView ? undefined : list.filter((r) => r.priority === t.priority).map((r) => r.id);
          return (
            <TodoRow key={t.id} todo={toData(t, !!closedView)} brands={brandOpts} users={userOpts} reorderIds={reorderIds} />
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {user.role === "owner" && <CeoMigrateButton />}
          <TodoKakaoSummary groups={kakaoGroups} dateStr={todayStr} />
          <TodoForm brands={brandOpts} users={userOpts} />
        </div>
      </div>

      {needsMigration && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn, #f59e0b)", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>다중 담당자 기능 준비 — DB 한 줄 실행 필요</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
            Supabase → SQL Editor에 아래를 붙여넣고 실행하면 한 업무에 담당자를 여러 명 지정할 수 있습니다.
            (실행 전에도 단일 담당자로는 동작합니다.)
          </p>
          <pre className="pre" style={{ maxHeight: 180, overflow: "auto", fontSize: 11.5 }}>{MIGRATE_SQL}</pre>
        </div>
      )}

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
