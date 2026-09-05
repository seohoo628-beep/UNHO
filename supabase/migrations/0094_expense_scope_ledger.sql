-- 0094 지출계획표 회사/개인 구분 + 가계부(일별 수입·지출 장부)
alter table public.expense_plans add column if not exists scope text not null default '회사'; -- 회사 | 개인
create index if not exists expense_plans_scope_idx on public.expense_plans(scope, month, kind, sort_order);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  scope text not null default '회사',       -- 회사 | 개인
  entry_date date not null,
  type text not null default '지출',         -- 지출 | 수입
  category text,
  name text not null,
  amount bigint not null default 0,
  method text,                               -- 카드 | 현금 | 계좌이체 | 자동이체 등
  brand text,
  memo text,
  plan_id uuid references public.expense_plans(id) on delete set null, -- 연결된 지출계획 항목
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ledger_entries_date_idx on public.ledger_entries(scope, entry_date);
create index if not exists ledger_entries_plan_idx on public.ledger_entries(plan_id);
alter table public.ledger_entries enable row level security;
drop policy if exists ledger_entries_all on public.ledger_entries;
create policy ledger_entries_all on public.ledger_entries for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
