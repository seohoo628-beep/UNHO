-- ============================================================================
-- 0032 — 전직원 투두 파일 첨부. (링크는 기존 ref_link 사용)
-- ============================================================================

alter table public.todos
  add column if not exists file_url  text,
  add column if not exists file_name text;
