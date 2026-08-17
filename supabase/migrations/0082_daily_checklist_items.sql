-- 홈 '오늘의 체크리스트' 사용자 정의 항목(고정 항목에 더해 직접 추가/편집).
-- weekdays: 반복 요일(0=일 … 6=토). NULL 또는 빈 배열이면 매일 표시.
create table if not exists public.daily_checklist_items (
  id uuid primary key default gen_random_uuid(),
  group_name text not null default '내 항목',
  label text not null,
  href text,
  note text,
  weekdays int[],
  sort_order int not null default 0,
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_checklist_items enable row level security;
drop policy if exists daily_checklist_items_all on public.daily_checklist_items;
create policy daily_checklist_items_all on public.daily_checklist_items for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

create index if not exists daily_checklist_items_active_idx
  on public.daily_checklist_items (active, sort_order);
