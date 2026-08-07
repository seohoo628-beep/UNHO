import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/time";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import { ApprovalRequestForm, ApprovalDecideButtons, ApprovalDeleteButton } from "@/components/EApprovalForms";

export const dynamic = "force-dynamic";

const SETUP_SQL = `create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default '일반',
  title text not null,
  amount bigint,
  body text,
  files jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requester_id uuid references public.users(id) on delete set null,
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.approval_requests enable row level security;
drop policy if exists approval_req_select on public.approval_requests;
create policy approval_req_select on public.approval_requests for select to authenticated
  using (public.current_app_role() in ('owner','staff'));
drop policy if exists approval_req_insert on public.approval_requests;
create policy approval_req_insert on public.approval_requests for insert to authenticated
  with check (public.current_app_role() in ('owner','staff'));
drop policy if exists approval_req_update on public.approval_requests;
create policy approval_req_update on public.approval_requests for update to authenticated
  using (public.current_app_role() = 'owner') with check (public.current_app_role() = 'owner');
drop policy if exists approval_req_delete on public.approval_requests;
create policy approval_req_delete on public.approval_requests for delete to authenticated
  using (public.current_app_role() = 'owner');`;

type Req = {
  id: string;
  kind: string;
  title: string;
  amount: number | null;
  body: string | null;
  files: { url: string; name: string }[] | null;
  status: string;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  users: { name: string } | null;
};

const STATUS_BADGE: Record<string, string> = { pending: "warn", approved: "ok", rejected: "owner" };
const STATUS_LABEL: Record<string, string> = { pending: "결재 대기", approved: "승인", rejected: "반려" };

export default async function EApprovalPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  const isOwner = user.role === "owner";
  const supabase = createSupabaseServerClient();

  const res = await supabase
    .from("approval_requests")
    .select("id, kind, title, amount, body, files, status, decision_note, decided_at, created_at, users:requester_id(name)")
    .order("created_at", { ascending: false })
    .limit(300);

  if (res.error && (res.error.code === "42P01" || /approval_requests/.test(res.error.message ?? ""))) {
    return (
      <div>
        <div className="page-head"><h1>전자결재</h1></div>
        <DbSetupNotice title="전자결재" sql={SETUP_SQL} />
      </div>
    );
  }

  const list = (res.data ?? []) as unknown as Req[];
  const pending = list.filter((r) => r.status === "pending");
  const decided = list.filter((r) => r.status !== "pending");

  const Card = ({ r }: { r: Req }) => (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${r.status === "approved" ? "#10b981" : r.status === "rejected" ? "#ef4444" : "#f59e0b"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="badge">{r.kind}</span>
            {r.title}
            <span className={`badge ${STATUS_BADGE[r.status] ?? ""}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
            기안 {r.users?.name ?? "-"} · {fmtDate(r.created_at)}
            {r.amount != null ? ` · ${r.amount.toLocaleString()}원` : ""}
          </div>
          {r.body && <div style={{ fontSize: 13.5, marginTop: 6, whiteSpace: "pre-wrap" }}>{r.body}</div>}
          {r.files && r.files.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {r.files.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noreferrer" className="btn sm" title={f.name}>📎 {f.name}</a>
              ))}
            </div>
          )}
          {r.status === "rejected" && r.decision_note && (
            <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--owner)" }}>반려 사유: {r.decision_note}</div>
          )}
          {r.status === "approved" && r.decision_note && (
            <div style={{ fontSize: 12.5, marginTop: 6, color: "var(--ink-2)" }}>메모: {r.decision_note}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {r.status === "pending" && <ApprovalDecideButtons id={r.id} isOwner={isOwner} />}
          <ApprovalDeleteButton id={r.id} isOwner={isOwner} />
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>전자결재</h1>
          <p>지출결의·발주 등을 상신하면 대표가 승인/반려한다. 결과는 알림으로 통보된다. (연차는 연차관리에서)</p>
        </div>
        <ApprovalRequestForm />
      </div>

      <div className="section-title">결재 대기 ({pending.length})</div>
      {pending.length === 0 ? (
        <div className="card"><div className="empty">대기 중인 결재가 없습니다.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pending.map((r) => <Card key={r.id} r={r} />)}
        </div>
      )}

      <div className="section-title" style={{ marginTop: 20 }}>처리 완료 ({decided.length})</div>
      {decided.length === 0 ? (
        <div className="card"><div className="empty">아직 없습니다.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {decided.map((r) => <Card key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}
