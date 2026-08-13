-- ============================================================================
-- 0074 — 안티에이징 관리(대표 개인, 비공개). 시술·병원 기록용. CEO 전용.
-- ============================================================================

create or replace function public.current_user_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ceo from public.users where auth_id = auth.uid() and active = true limit 1), false);
$$;

create table if not exists public.antiaging_logs (
  id          uuid primary key default gen_random_uuid(),
  log_date    text,        -- 시술일(YYYY-MM-DD)
  hospital    text,        -- 병원/의원
  treatment   text,        -- 시술/관리 내역
  doctor      text,        -- 담당 원장
  area        text,        -- 부위
  cost        integer,     -- 비용(원)
  next_date   text,        -- 다음 예정/재방문
  note        text,        -- 효과·후기·메모
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists antiaging_date_idx on public.antiaging_logs(log_date desc);

alter table public.antiaging_logs enable row level security;
drop policy if exists antiaging_ceo on public.antiaging_logs;
create policy antiaging_ceo on public.antiaging_logs for all to authenticated
  using (public.current_user_is_ceo()) with check (public.current_user_is_ceo());
