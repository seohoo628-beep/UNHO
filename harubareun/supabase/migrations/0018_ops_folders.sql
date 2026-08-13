-- 0018_ops_folders.sql
-- 경영지원매니저 업무일지 / 계정 ID·PW / 제품 이미지·영상 자료 폴더

-- 경영지원매니저 일일 업무일지
create table if not exists public.manager_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  category text not null,
  task text not null,
  status text not null default '예정',
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists manager_logs_date_idx on public.manager_logs(log_date desc);

-- 월간 성과·인센티브 트래커 (공구·프로모션 매출 → 인센티브 자동계산)
create table if not exists public.manager_incentives (
  id uuid primary key default gen_random_uuid(),
  month text not null unique,               -- YYYY-MM
  gonggu_count integer not null default 0,
  gonggu_sales bigint not null default 0,
  promo_sales bigint not null default 0,
  rate_pct numeric not null default 5,
  note text,
  updated_at timestamptz not null default now()
);

-- 계정 ID·PW 금고 (스마트스토어·쿠팡 등 운영 계정)
create table if not exists public.app_accounts (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  purpose text,
  login_id text,
  password text,
  url text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 제품 이미지·영상 자료 (외부 링크 레지스트리)
create table if not exists public.product_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default '이미지',       -- 이미지 / 영상
  brand text,
  link text,
  thumb_url text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.manager_logs       enable row level security;
alter table public.manager_incentives enable row level security;
alter table public.app_accounts        enable row level security;
alter table public.product_assets      enable row level security;

drop policy if exists manager_logs_all on public.manager_logs;
create policy manager_logs_all on public.manager_logs for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

drop policy if exists manager_incentives_all on public.manager_incentives;
create policy manager_incentives_all on public.manager_incentives for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

drop policy if exists app_accounts_all on public.app_accounts;
create policy app_accounts_all on public.app_accounts for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

drop policy if exists product_assets_all on public.product_assets;
create policy product_assets_all on public.product_assets for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
