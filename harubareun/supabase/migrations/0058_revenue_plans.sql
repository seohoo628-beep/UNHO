-- ============================================================================
-- 0058 — 매출증대방안. 유입·체류 / 전환 / 재구매 레버별 플랜과 기록을
--        일·주·월 단위로 관리.
-- ============================================================================

create table if not exists public.revenue_plans (
  id           uuid primary key default gen_random_uuid(),
  period_type  text not null default '주' check (period_type in ('일','주','월')),
  period_label text,                       -- 예) 2026-08-09 / 2026-W32 / 2026-08
  lever        text not null default '유입·체류'
               check (lever in ('유입·체류','전환','재구매')),
  title        text not null,              -- 플랜명/주제
  plan         text,                       -- 개선 플랜
  record       text,                       -- 실행 기록/결과
  target       text,                       -- 목표 지표
  actual       text,                       -- 실제 지표
  status       text not null default '예정' check (status in ('예정','진행','완료','보류')),
  log_date     date,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists revenue_plans_period_idx on public.revenue_plans(period_type);
create index if not exists revenue_plans_lever_idx on public.revenue_plans(lever);
create index if not exists revenue_plans_created_idx on public.revenue_plans(created_at desc);

alter table public.revenue_plans enable row level security;
drop policy if exists revenue_plans_all on public.revenue_plans;
create policy revenue_plans_all on public.revenue_plans for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
