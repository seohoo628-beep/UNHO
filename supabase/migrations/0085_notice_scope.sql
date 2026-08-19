-- 공지사항을 화면(스코프)별로 분리: 업무투두('todos') / 업무일지('worklog') 등.
alter table public.todo_notices add column if not exists scope text not null default 'todos';
create index if not exists todo_notices_scope_idx on public.todo_notices (scope, pinned desc, created_at desc);
