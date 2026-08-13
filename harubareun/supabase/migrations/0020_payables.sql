-- 0020_payables.sql — 미지급금 내역 (거래처에 지급해야 할 금액)

create table if not exists public.payables (
  id uuid primary key default gen_random_uuid(),
  counterparty text not null,          -- 거래처
  item text,                            -- 항목/내용
  amount bigint not null default 0,     -- 지급 예정액(청구받은 금액)
  paid bigint not null default 0,       -- 지급액
  bill_date date,                       -- 청구일(세금계산서 등)
  due_date date,                        -- 지급 예정일
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payables_due_idx on public.payables(due_date);

alter table public.payables enable row level security;
drop policy if exists payables_all on public.payables;
create policy payables_all on public.payables for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
