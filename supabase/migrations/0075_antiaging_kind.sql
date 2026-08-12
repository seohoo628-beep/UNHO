-- ============================================================================
-- 0075 — 안티에이징 관리: 종류(시술/영양제/운동/기타) 컬럼 추가.
-- ============================================================================

alter table public.antiaging_logs add column if not exists kind text not null default '시술';
create index if not exists antiaging_kind_idx on public.antiaging_logs(kind);
