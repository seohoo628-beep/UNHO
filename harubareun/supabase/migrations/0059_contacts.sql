-- ============================================================================
-- 0059 — 인맥관리(대표 개인). CEO 본인만 접근(0054의 current_user_is_ceo 재사용).
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

create table if not exists public.contacts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,            -- 이름
  job            text,                     -- 직업
  company        text,                     -- 회사명
  contact        text,                     -- 연락처
  birthday       text,                     -- 생일(예: 1988-03-14 / 3/14 / 음력)
  where_met      text,                     -- 만난 곳/관계
  marital        text,                     -- 결혼 유무(미혼/기혼/기타)
  has_children   boolean not null default false,  -- 자녀 유무
  children_names text,                     -- 자녀 이름
  note           text,                     -- 메모
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists contacts_name_idx on public.contacts(name);

alter table public.contacts enable row level security;
drop policy if exists contacts_ceo on public.contacts;
create policy contacts_ceo on public.contacts
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());
