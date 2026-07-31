-- ============================================================================
-- 0010 — P&L 스냅샷. 구글 P&L 시트의 핵심 KPI를 날짜별로 저장해 추이 트래킹.
-- 자사(owner/staff)만 접근.
-- ============================================================================

create table if not exists public.pnl_snapshots (
  id            uuid primary key default gen_random_uuid(),
  snapshot_date date not null default (now() at time zone 'Asia/Seoul')::date,
  revenue       numeric,   -- 총 매출
  net_revenue   numeric,   -- 순 매출
  op_profit     numeric,   -- 영업 이익
  margin_pct    numeric,   -- 이익률(%)
  ad_cost       numeric,   -- 광고비
  roas          numeric,   -- ROAS
  refund_pct    numeric,   -- 환불률(%)
  orders        numeric,   -- 주문 건수
  aov           numeric,   -- 객단가
  raw           jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_pnl_date on public.pnl_snapshots(snapshot_date desc);

alter table public.pnl_snapshots enable row level security;

drop policy if exists pnl_all on public.pnl_snapshots;
create policy pnl_all on public.pnl_snapshots
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
