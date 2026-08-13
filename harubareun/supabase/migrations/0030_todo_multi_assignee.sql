-- ============================================================================
-- 0030 — 전직원 투두 다중 담당자. 한 업무에 담당자를 여러 명 지정할 수 있게 한다.
-- 기존 단일 담당자(assignee_user_id)는 그대로 두고 배열 컬럼을 추가·백필한다.
-- ============================================================================

alter table public.todos
  add column if not exists assignee_user_ids uuid[] not null default '{}'::uuid[];

-- 기존 단일 담당자를 배열로 백필(배열이 비어 있는 행만).
update public.todos
  set assignee_user_ids = array[assignee_user_id]
  where assignee_user_id is not null
    and coalesce(cardinality(assignee_user_ids), 0) = 0;

create index if not exists idx_todos_assignees
  on public.todos using gin(assignee_user_ids);
