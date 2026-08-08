import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DbSetupNotice } from "@/components/DbSetupNotice";

export const dynamic = "force-dynamic";

const SETUP_SQL = `create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  actor_name text, action text not null, entity text not null,
  entity_label text, detail text,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_owner_select on public.audit_logs;
create policy audit_logs_owner_select on public.audit_logs for select to authenticated
  using (public.current_app_role() = 'owner');`;

const ENTITY_LABEL: Record<string, string> = {
  todo: "업무투두",
  ceo_todo: "CEO투두",
  approval: "전자결재",
  leave: "연차",
  inventory: "재고",
  product_dev: "제품개발",
  assignee: "담당자",
};
const ACTION_LABEL: Record<string, string> = {
  created: "생성",
  updated: "수정",
  deleted: "삭제",
  status: "상태변경",
  approved: "승인",
  rejected: "반려",
};
const ACTION_TONE: Record<string, string> = {
  created: "ok",
  deleted: "owner",
  approved: "ok",
  rejected: "owner",
  updated: "",
  status: "accent",
};

const ENTITIES = ["todo", "approval", "leave", "inventory", "product_dev", "assignee"];

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default async function AuditPage({ searchParams }: { searchParams: { entity?: string } }) {
  const user = await requireAppUser();
  if (user.role !== "owner") redirect("/");
  const supabase = createSupabaseServerClient();

  const entity = searchParams.entity;
  let query = supabase
    .from("audit_logs")
    .select("id, actor_name, action, entity, entity_label, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (entity && ENTITIES.includes(entity)) query = query.eq("entity", entity);

  const res = await query;
  if (res.error && (res.error.code === "42P01" || /audit_logs/.test(res.error.message ?? ""))) {
    return (
      <div>
        <div className="page-head"><h1>변경 이력</h1></div>
        <DbSetupNotice title="변경 이력" sql={SETUP_SQL} />
      </div>
    );
  }

  const rows = (res.data ?? []) as {
    id: string;
    actor_name: string | null;
    action: string;
    entity: string;
    entity_label: string | null;
    detail: string | null;
    created_at: string;
  }[];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>변경 이력</h1>
          <p>누가 언제 무엇을 생성·수정·삭제·결재했는지 기록한다. (대표 전용)</p>
        </div>
      </div>

      <div className="btn-row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <a className={`btn sm${!entity ? " primary" : ""}`} href="/audit">전체</a>
        {ENTITIES.map((e) => (
          <a key={e} className={`btn sm${entity === e ? " primary" : ""}`} href={`/audit?entity=${e}`}>{ENTITY_LABEL[e] ?? e}</a>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {rows.length === 0 ? (
          <div className="empty">기록이 없습니다.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ whiteSpace: "nowrap" }}>시각</th>
                <th>처리자</th>
                <th>구분</th>
                <th>작업</th>
                <th>대상</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }} className="muted">{fmt(r.created_at)}</td>
                  <td>{r.actor_name ?? "-"}</td>
                  <td><span className="badge">{ENTITY_LABEL[r.entity] ?? r.entity}</span></td>
                  <td><span className={`badge ${ACTION_TONE[r.action] ?? ""}`}>{ACTION_LABEL[r.action] ?? r.action}</span></td>
                  <td>
                    {r.entity_label ?? "-"}
                    {r.detail ? <span className="muted" style={{ fontSize: 12 }}> · {r.detail}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
