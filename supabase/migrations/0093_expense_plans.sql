-- 0093 지출계획표: 월별 고정비·변동비 계획/실제 지출 기록
create table if not exists public.expense_plans (
  id uuid primary key default gen_random_uuid(),
  month text not null,                 -- 'YYYY-MM'
  kind text not null default '고정',    -- 고정 | 변동
  category text,                        -- 임대료/인건비/광고비 등
  name text not null,                   -- 항목명
  planned bigint not null default 0,    -- 계획 금액
  actual bigint not null default 0,     -- 실제 지출
  due_day int,                          -- 지급일(1~31)
  brand text,                           -- 브랜드 태그
  memo text,
  sort_order int not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expense_plans_month_idx on public.expense_plans(month, kind, sort_order);
alter table public.expense_plans enable row level security;
drop policy if exists expense_plans_all on public.expense_plans;
create policy expense_plans_all on public.expense_plans for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
