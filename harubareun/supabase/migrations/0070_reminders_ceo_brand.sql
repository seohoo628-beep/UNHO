-- ============================================================================
-- 0070 — 리마인드: 고정·브랜드 컬럼 추가(정렬은 0069의 sort_order 사용).
--        CEO 투두: 브랜드 컬럼 추가.
-- ============================================================================

alter table public.reminders add column if not exists pinned boolean not null default false;
alter table public.reminders add column if not exists brand text;

alter table public.ceo_todos add column if not exists brand text;
