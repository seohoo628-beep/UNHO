-- ============================================================================
-- 0057 — 이벤트·프로모션 기획/결과. 주·월·연 단위로 기획하고 결과를 입력.
-- ============================================================================

create table if not exists public.promotions (
  id           uuid primary key default gen_random_uuid(),
  period_type  text not null default '월' check (period_type in ('주','월','연')),
  period_label text,                       -- 예) 2026-W32 / 2026-08 / 2026
  title        text not null,              -- 기획명
  channel      text,                       -- 채널
  plan         text,                       -- 기획 내용
  budget       bigint,                     -- 예산
  result       text,                       -- 결과 입력
  outcome      text,                       -- 성과 수치(매출·참여 등)
  status       text not null default '예정' check (status in ('예정','진행','완료','보류')),
  start_date   date,
  end_date     date,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists promotions_period_idx on public.promotions(period_type);
create index if not exists promotions_created_idx on public.promotions(created_at desc);

alter table public.promotions enable row level security;
drop policy if exists promotions_all on public.promotions;
create policy promotions_all on public.promotions for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
