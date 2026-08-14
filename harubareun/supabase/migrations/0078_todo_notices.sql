-- ============================================================================
-- 0078 — 업무투두 상단 공지사항. 대표/직원이 올리는 짧은 공지.
-- ============================================================================

create table if not exists public.todo_notices (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  pinned      boolean not null default false,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists todo_notices_created_idx on public.todo_notices(created_at desc);

alter table public.todo_notices enable row level security;
drop policy if exists todo_notices_all on public.todo_notices;
create policy todo_notices_all on public.todo_notices for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
