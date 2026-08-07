-- ============================================================================
-- 0042 — 제품개발 다중 첨부파일. product_developments.files (jsonb 배열).
-- ============================================================================

alter table public.product_developments
  add column if not exists files jsonb not null default '[]'::jsonb;
