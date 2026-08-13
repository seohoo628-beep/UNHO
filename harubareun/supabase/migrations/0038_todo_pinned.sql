-- ============================================================================
-- 0038 — 투두 상단 고정(pin). 고정한 항목은 그룹 최상단에 유지.
-- ============================================================================

alter table public.ceo_todos add column if not exists pinned boolean not null default false;
alter table public.todos     add column if not exists pinned boolean not null default false;
