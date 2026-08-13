-- ============================================================================
-- 0067 — 명함목록(리멤버 방식). 명함 사진 + 구조화 필드 + AI 자동인식.
--        대표 개인 전용(0054의 current_user_is_ceo 재사용).
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

create table if not exists public.business_cards (
  id           uuid primary key default gen_random_uuid(),
  name         text,                     -- 이름
  company      text,                     -- 회사
  department   text,                     -- 부서
  position     text,                     -- 직책
  mobile       text,                     -- 휴대폰
  office_phone text,                     -- 회사전화
  email        text,                     -- 이메일
  fax          text,                     -- 팩스
  address      text,                     -- 주소
  website      text,                     -- 홈페이지
  tags         text,                     -- 태그(콤마 구분)
  image_url    text,                     -- 명함 이미지 URL
  met_date     text,                     -- 만난 날짜/획득일
  note         text,                     -- 메모
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists business_cards_name_idx on public.business_cards(name);
create index if not exists business_cards_company_idx on public.business_cards(company);

alter table public.business_cards enable row level security;
drop policy if exists business_cards_all on public.business_cards;
drop policy if exists business_cards_ceo on public.business_cards;
create policy business_cards_ceo on public.business_cards
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());
