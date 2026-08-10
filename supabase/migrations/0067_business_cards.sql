-- ============================================================================
-- 0067 — 명함목록(리멤버 방식). 명함 사진 + 구조화 필드 + AI 자동인식.
--        전 직원(owner/staff) 공용. product_assets 와 동일한 권한.
-- ============================================================================

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
create policy business_cards_all on public.business_cards for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
