-- ============================================================================
-- 0045 — 전자결재(결재선) 일반화. 지출결의·발주·일반 기안을 대표가 승인/반려.
--   (연차는 기존 leave_usages 승인 흐름을 그대로 사용)
-- ============================================================================

create table if not exists public.approval_requests (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default '일반',   -- 지출결의 | 발주 | 일반
  title          text not null,
  amount         bigint,                          -- 금액(있으면)
  body           text,                            -- 상세 내용
  files          jsonb not null default '[]'::jsonb,
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  requester_id   uuid references public.users(id) on delete set null,
  decided_by     uuid references public.users(id) on delete set null,
  decided_at     timestamptz,
  decision_note  text,                            -- 반려/승인 사유
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists approval_req_status_idx on public.approval_requests(status);
create index if not exists approval_req_time_idx on public.approval_requests(created_at desc);

alter table public.approval_requests enable row level security;

-- 조회·기안: owner/staff. 결재(수정)·삭제: owner 전용.
drop policy if exists approval_req_select on public.approval_requests;
create policy approval_req_select on public.approval_requests for select to authenticated
  using (public.current_app_role() in ('owner','staff'));
drop policy if exists approval_req_insert on public.approval_requests;
create policy approval_req_insert on public.approval_requests for insert to authenticated
  with check (public.current_app_role() in ('owner','staff'));
drop policy if exists approval_req_update on public.approval_requests;
create policy approval_req_update on public.approval_requests for update to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
drop policy if exists approval_req_delete on public.approval_requests;
create policy approval_req_delete on public.approval_requests for delete to authenticated
  using (public.current_app_role() = 'owner');
