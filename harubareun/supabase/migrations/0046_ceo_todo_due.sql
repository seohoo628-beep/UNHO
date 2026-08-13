-- ============================================================================
-- 0046 — CEO 투두 마감일. 3일 전·당일 알림(이메일+모바일)에 사용.
-- ============================================================================

alter table public.ceo_todos add column if not exists due_date date;
create index if not exists ceo_todos_due_idx on public.ceo_todos(due_date);
