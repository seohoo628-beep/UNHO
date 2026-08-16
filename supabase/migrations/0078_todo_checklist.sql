-- 업무투두·CEO 투두: 상위 업무 + 하위 체크리스트(jsonb 배열: [{id,text,done}]).
alter table public.todos add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table public.ceo_todos add column if not exists checklist jsonb not null default '[]'::jsonb;
