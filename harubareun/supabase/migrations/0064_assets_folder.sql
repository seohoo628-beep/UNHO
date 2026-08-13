-- ============================================================================
-- 0064 — 각종 자료(product_assets)에 사용자 지정 폴더 컬럼 추가.
-- ============================================================================

alter table public.product_assets add column if not exists folder text;
create index if not exists product_assets_folder_idx on public.product_assets(folder);
