-- 0096 가계부 반복 지출(매월 자동 입력)
create table if not exists public.ledger_recurrings (
  id uuid primary key default gen_random_uuid(),
  scope text not null default '회사',       -- 회사 | 개인
  type text not null default '지출',         -- 지출 | 수입
  category text,
  name text not null,
  amount bigint not null default 0,
  method text,
  brand text,
  memo text,
  day_of_month int not null default 1,       -- 매월 N일 (말일보다 크면 말일)
  start_month text not null,                 -- 'YYYY-MM' 부터
  end_month text,                            -- 'YYYY-MM' 까지 (null = 계속)
  active boolean not null default true,
  skipped_months jsonb not null default '[]'::jsonb, -- 사용자가 삭제한 달(재생성 안 함)
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ledger_recurrings enable row level security;
drop policy if exists ledger_recurrings_all on public.ledger_recurrings;
create policy ledger_recurrings_all on public.ledger_recurrings for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

alter table public.ledger_entries add column if not exists recurring_id uuid references public.ledger_recurrings(id) on delete set null;
alter table public.ledger_entries add column if not exists recurring_month text;
create unique index if not exists ledger_entries_recurring_uniq on public.ledger_entries(recurring_id, recurring_month) where recurring_id is not null;
