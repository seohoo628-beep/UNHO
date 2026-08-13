-- ============================================================================
-- 0016 — 인사(HR) 공유 테이블. 직원관리 / 연차관리.
-- 여러 사용자·기기가 같은 데이터를 공유하도록 DB로 저장한다. owner/staff 접근.
-- ============================================================================

-- ── 직원관리(직원 명부) ──────────────────────────────────────
create table if not exists public.staff_directory (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,          -- 이름
  position    text,                   -- 직책
  hire_date   date,                   -- 입사일
  salary      bigint default 0,       -- 연봉(원)
  phone       text,                   -- 연락처
  note        text,                   -- 특이사항
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.staff_directory enable row level security;
drop policy if exists staff_directory_all on public.staff_directory;
create policy staff_directory_all on public.staff_directory
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

-- ── 연차관리(연차·반차 신청) ─────────────────────────────────
create table if not exists public.leave_requests (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,          -- 직원명
  type        text not null default '연차'
              check (type in ('연차', '반차', '병가', '경조사', '기타')),
  start_date  date not null,          -- 시작일
  end_date    date,                   -- 종료일
  days        numeric not null default 1,   -- 일수(반차 0.5)
  reason      text,                   -- 사유
  status      text not null default '신청'
              check (status in ('신청', '승인', '반려')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_leave_start on public.leave_requests(start_date);

alter table public.leave_requests enable row level security;
drop policy if exists leave_requests_all on public.leave_requests;
create policy leave_requests_all on public.leave_requests
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
