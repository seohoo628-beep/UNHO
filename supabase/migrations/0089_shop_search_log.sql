-- ============================================================================
-- 0089 — 경쟁 제품 검색어 기록.
--
-- 리뷰 스냅샷(0088)은 검색이 일어나야 쌓인다. 어떤 검색어가 실제로 쓰였는지를
-- 여기 남겨 두면, 정기 작업(/api/cron/review-snapshots)이 최근 검색어를
-- 사람 없이 재검색해 스냅샷을 계속 쌓는다 — 판매건수 추정이 저절로 찬다.
-- ============================================================================

create table if not exists public.shop_search_log (
  query      text primary key,
  last_used  timestamptz not null default now()
);

alter table public.shop_search_log enable row level security;

drop policy if exists ssl_all on public.shop_search_log;
create policy ssl_all on public.shop_search_log
  for all
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
