-- ============================================================================
-- 0091 — 커머스 운영 프레임 도구 연동
-- (1) 이벤트 관리: 명분×기간×수량 3요소 완성을 위한 목표수량 컬럼
-- (2) 제품개발: 제품 채택 8필터 체크 + 원가율/판매가 손익 판정용 컬럼
-- ============================================================================

alter table public.marketing_events
  add column if not exists target_qty int;                          -- 목표(한정) 수량

alter table public.product_developments
  add column if not exists adoption_flags boolean[] not null default '{}'::boolean[];  -- 채택 8필터
alter table public.product_developments
  add column if not exists sell_price bigint;                       -- 판매가(원). 원가율 = cost_estimate / sell_price
