-- 홈 오늘의 체크리스트 사용자 항목에 담당자(assignee) 지정.
-- 비어 있으면 공용 항목(모두에게 표시).
alter table public.daily_checklist_items add column if not exists assignee text;
create index if not exists daily_checklist_items_assignee_idx
  on public.daily_checklist_items (assignee);
