-- ============================================================================
-- 0047 — 변경 이력(감사 로그). 주요 생성/수정/삭제/결재를 기록. 대표만 조회.
-- ============================================================================

create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.users(id) on delete set null,
  actor_name   text,                 -- 기록 시점 이름(계정 삭제돼도 남게 비정규화)
  action       text not null,        -- created | updated | deleted | status | approved | rejected
  entity       text not null,        -- todo | ceo_todo | approval | leave | inventory | product_dev | assignee
  entity_label text,                 -- 대상 제목/이름
  detail       text,                 -- 부가 설명
  created_at   timestamptz not null default now()
);
create index if not exists audit_logs_time_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id);

alter table public.audit_logs enable row level security;
-- 조회는 대표만. 기록(insert)은 서버(service role)가 담당.
drop policy if exists audit_logs_owner_select on public.audit_logs;
create policy audit_logs_owner_select on public.audit_logs for select to authenticated
  using (public.current_app_role() = 'owner');
