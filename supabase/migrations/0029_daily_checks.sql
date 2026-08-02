-- 0029_daily_checks.sql — 일일 체크리스트(운영 현황)
create table if not exists public.daily_checks (
  check_date date not null,
  item_key text not null,
  done boolean not null default false,
  note text,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (check_date, item_key)
);
alter table public.daily_checks enable row level security;
drop policy if exists daily_checks_all on public.daily_checks;
create policy daily_checks_all on public.daily_checks for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
