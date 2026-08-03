-- ============================================================================
-- 0033 — 전직원 투두 다중 파일 첨부. files: [{url, name}, ...]
-- 기존 단일 file_url/file_name은 조회 시 함께 병합해 보여준다(백필 불필요).
-- ============================================================================

alter table public.todos
  add column if not exists files jsonb not null default '[]'::jsonb;
