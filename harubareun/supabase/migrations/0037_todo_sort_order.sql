-- ============================================================================
-- 0037 — 투두 수동 정렬. 우선순위(그룹) 안에서 위/아래로 순서 조정.
-- ============================================================================

alter table public.ceo_todos add column if not exists sort_order int not null default 0;
alter table public.todos     add column if not exists sort_order int not null default 0;

create index if not exists ceo_todos_sort_idx on public.ceo_todos(sort_order);
create index if not exists todos_sort_idx on public.todos(sort_order);
