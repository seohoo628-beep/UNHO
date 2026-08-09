-- ============================================================================
-- 0060 — 인맥관리 직업군 분류. category 컬럼 추가.
--   값: 기업인 / 연예인 / 인플루언서 / 전문직 / 투자관련 / 기타
-- ============================================================================

alter table public.contacts
  add column if not exists category text;

-- 직책(직급) 컬럼도 함께 추가.
alter table public.contacts
  add column if not exists title text;

create index if not exists contacts_category_idx on public.contacts(category);
