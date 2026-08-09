-- ============================================================================
-- 0061 — 인맥관리 상세 필드 추가: 고향/학력/연락처2/소속사/그룹·대표작/집주소/
--         이메일/출생연도.
-- ============================================================================

alter table public.contacts add column if not exists hometown text;    -- 고향
alter table public.contacts add column if not exists education text;    -- 학력
alter table public.contacts add column if not exists contact2 text;     -- 연락처2
alter table public.contacts add column if not exists agency text;       -- 소속사
alter table public.contacts add column if not exists group_work text;   -- 그룹명·대표작
alter table public.contacts add column if not exists address text;      -- 집주소
alter table public.contacts add column if not exists email text;        -- 이메일
alter table public.contacts add column if not exists birth_year int;    -- 출생연도
