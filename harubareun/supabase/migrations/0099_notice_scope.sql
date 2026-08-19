-- ============================================================================
-- 0099 — 공지사항 스코프
--   todo_notices를 화면별로 나눠 쓴다. 기존 공지는 'todos'(업무투두)로 유지.
--   업무일지 전용 공지는 scope='worklog'.
-- ============================================================================

alter table public.todo_notices add column if not exists scope text not null default 'todos';
create index if not exists todo_notices_scope_idx on public.todo_notices(scope, created_at desc);
