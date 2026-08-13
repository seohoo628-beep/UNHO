-- ============================================================================
-- 0014 — 업무 투두. 간단히 입력하고 팔로업하는 할 일 보드.
-- 보류/완료/취소는 '완료된 업무'로 분리해 본다.
-- owner/staff 접근.
-- ============================================================================

create table if not exists public.todos (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid references public.brands(id) on delete set null,
  title             text not null,                 -- 업무
  assignee_user_id  uuid references public.users(id) on delete set null,
  priority          text not null default '보통'
                    check (priority in ('높음', '보통', '낮음')),
  due_date          date,                          -- 마감기한
  status            text not null default '예정'
                    check (status in ('예정', '진행', '보류', '완료', '취소')),
  ref_link          text,                          -- 참고 링크
  note              text,                          -- 메모
  created_by        uuid references public.users(id) on delete set null,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_todos_status on public.todos(status);
create index if not exists idx_todos_brand on public.todos(brand_id);

alter table public.todos enable row level security;

drop policy if exists todos_all on public.todos;
create policy todos_all on public.todos
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
