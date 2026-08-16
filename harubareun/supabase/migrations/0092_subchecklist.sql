-- ============================================================================
-- 0092 — 상위 업무 + 하위 체크리스트 구조
-- 업무투두(todos)·런칭준비(launch_checklist)에 하위 체크리스트(jsonb) 추가.
-- 형식: [{ "text": "항목", "done": false }, ...]
-- ============================================================================

alter table public.todos
  add column if not exists checklist jsonb not null default '[]'::jsonb;

alter table public.launch_checklist
  add column if not exists checklist jsonb not null default '[]'::jsonb;
