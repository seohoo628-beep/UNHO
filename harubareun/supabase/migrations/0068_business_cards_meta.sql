-- ============================================================================
-- 0068 — 명함목록: 등록일·위치(획득 장소) 필드 추가.
-- ============================================================================

alter table public.business_cards add column if not exists registered_date text;  -- 등록일(YYYY-MM-DD)
alter table public.business_cards add column if not exists location text;          -- 획득 위치(현재 위치 자동)
