-- ============================================================================
-- 0041 — 재고 품목에 생산일·유효기간 추가.
-- ============================================================================

alter table public.inventory_items add column if not exists production_date date;
alter table public.inventory_items add column if not exists expiry_date date;
create index if not exists inv_items_expiry_idx on public.inventory_items(expiry_date);
