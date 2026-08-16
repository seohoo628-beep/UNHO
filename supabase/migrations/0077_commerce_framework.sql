-- 커머스 운영 프레임: 브랜드 매출 목표(대시보드 연동) + 제품 8필터 심사 결과(팀 공유)

-- 1) 브랜드별 매출 목표(역산 입력값). 홈/대시보드에서 함께 노출.
create table if not exists public.brand_revenue_goals (
  brand text primary key,
  annual numeric not null default 0,
  staff int not null default 1,
  fixed_monthly numeric not null default 0,
  margin_pct numeric not null default 20,
  weekend_mult numeric not null default 1.3,
  updated_at timestamptz not null default now(),
  updated_by_name text
);
alter table public.brand_revenue_goals enable row level security;
grant all on public.brand_revenue_goals to authenticated;
drop policy if exists brand_revenue_goals_all on public.brand_revenue_goals;
create policy brand_revenue_goals_all on public.brand_revenue_goals for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

-- 2) 제품 8필터 채택 심사 결과(팀 공유).
create table if not exists public.product_screenings (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  brand text,
  checks boolean[] not null default '{}',
  diffs text[] not null default '{}',
  passed boolean not null default false,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_screenings enable row level security;
grant all on public.product_screenings to authenticated;
drop policy if exists product_screenings_all on public.product_screenings;
create policy product_screenings_all on public.product_screenings for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
create index if not exists idx_product_screenings_created on public.product_screenings (created_at desc);
