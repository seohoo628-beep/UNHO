-- 업무투두 상단 공지사항. 대표/직원 모두 읽고, 작성·삭제는 로그인 사용자(owner/staff)만.
create table if not exists public.todo_notices (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  pinned boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

alter table public.todo_notices enable row level security;
grant all on public.todo_notices to authenticated;

drop policy if exists todo_notices_read on public.todo_notices;
create policy todo_notices_read on public.todo_notices for select to authenticated
  using (public.current_app_role() in ('owner','staff','guest'));

drop policy if exists todo_notices_write on public.todo_notices;
create policy todo_notices_write on public.todo_notices for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

create index if not exists idx_todo_notices_created on public.todo_notices (pinned desc, created_at desc);
