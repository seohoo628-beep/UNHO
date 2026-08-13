-- 0019_receivables.sql — 미수금 내역

create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  counterparty text not null,          -- 거래처
  item text,                            -- 항목/내용
  billed bigint not null default 0,     -- 청구액
  received bigint not null default 0,   -- 입금액
  bill_date date,                       -- 청구일
  due_date date,                        -- 입금예정일
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists receivables_due_idx on public.receivables(due_date);

alter table public.receivables enable row level security;
drop policy if exists receivables_all on public.receivables;
create policy receivables_all on public.receivables for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
