-- ============================================================================
-- 0066 — 틱톡 영업 리스트(대표 개인). CEO 본인만 접근(0054의 current_user_is_ceo 재사용).
--        인맥관리(contacts)와 동일한 형식·권한. 영업 파이프라인용 필드로 구성.
-- ============================================================================

-- 0054 미적용 대비 함수 보장(멱등).
create or replace function public.current_user_is_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_ceo from public.users
      where auth_id = auth.uid() and active = true
      limit 1),
    false);
$$;

create table if not exists public.tiktok_leads (
  id          uuid primary key default gen_random_uuid(),
  handle      text,                     -- 계정명(@핸들)
  name        text,                     -- 담당자/실명
  category    text,                     -- 분야(뷰티/패션/음식 등)
  stage       text,                     -- 영업단계(미접촉/DM발송/협의중/계약완료 등)
  followers   integer,                  -- 팔로워 수
  product     text,                     -- 제안 제품
  contact     text,                     -- 연락처
  contact2    text,                     -- 연락처2
  email       text,                     -- 이메일
  link        text,                     -- 틱톡 링크
  agency      text,                     -- 소속사/MCN
  source      text,                     -- 유입경로/발견처
  note        text,                     -- 메모
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tiktok_leads_handle_idx on public.tiktok_leads(handle);
create index if not exists tiktok_leads_stage_idx on public.tiktok_leads(stage);

alter table public.tiktok_leads enable row level security;
drop policy if exists tiktok_leads_ceo on public.tiktok_leads;
create policy tiktok_leads_ceo on public.tiktok_leads
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());
