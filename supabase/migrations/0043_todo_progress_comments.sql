-- ============================================================================
-- 0043 — 업무 협업 고도화(플로우 레퍼런스).
--   1) todos.progress : 진행률(0~100)
--   2) todo_comments   : 업무별 댓글·멘션 스레드
-- ============================================================================

alter table public.todos add column if not exists progress int not null default 0;

create table if not exists public.todo_comments (
  id          uuid primary key default gen_random_uuid(),
  todo_id     uuid not null references public.todos(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  body        text not null,
  mentions    uuid[] not null default '{}'::uuid[],
  created_at  timestamptz not null default now()
);
create index if not exists todo_comments_todo_idx on public.todo_comments(todo_id);
create index if not exists todo_comments_time_idx on public.todo_comments(created_at);

alter table public.todo_comments enable row level security;
drop policy if exists todo_comments_all on public.todo_comments;
create policy todo_comments_all on public.todo_comments for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
