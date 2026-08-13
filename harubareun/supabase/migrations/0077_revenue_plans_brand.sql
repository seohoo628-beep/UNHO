-- ============================================================================
-- 0077 — 매출증대방안(revenue_plans)에 브랜드 컬럼 추가.
--        전역 브랜드 선택(하루바른/나아)으로 필터하기 위함.
-- ============================================================================

alter table public.revenue_plans
  add column if not exists brand_id uuid references public.brands(id) on delete set null;
create index if not exists revenue_plans_brand_idx on public.revenue_plans(brand_id);
