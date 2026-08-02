-- ============================================================================
-- 0016 — 연차관리대장. 근로기준법 제60조 기준(입사연도 월 1일, 1년+ 15일+근속가산).
-- 부여일수·월별 사용·잔여는 앱에서 자동 계산. owner/staff 접근.
-- ============================================================================

create table if not exists public.leave_members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,               -- 성명
  join_date   date not null,               -- 입사일
  carryover   numeric not null default 0,  -- 이월(수동)
  note        text,
  active      boolean not null default true,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_leave_members_active on public.leave_members(active);

create table if not exists public.leave_usages (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.leave_members(id) on delete cascade,
  use_date    date not null,               -- 사용일자
  type        text not null default '연차'
              check (type in ('연차', '반차(오전)', '반차(오후)')),
  approver    text,                         -- 승인
  note        text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_leave_usages_member on public.leave_usages(member_id);
create index if not exists idx_leave_usages_date on public.leave_usages(use_date);

alter table public.leave_members enable row level security;
alter table public.leave_usages enable row level security;

drop policy if exists leave_members_all on public.leave_members;
create policy leave_members_all on public.leave_members
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

drop policy if exists leave_usages_all on public.leave_usages;
create policy leave_usages_all on public.leave_usages
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
