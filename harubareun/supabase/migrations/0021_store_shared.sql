-- ============================================================================
-- 0021 — F&B/다이닝 플랫폼 공유 데이터. 거래처(store_vendors)·온라인 주문처(store_order_links).
-- /fnb, /dining 은 공개(비로그인) 플랫폼이라 서버 액션(service_role)으로만 읽고 쓴다.
-- RLS 활성 + 정책 없음 → anon/authenticated 직접 접근 차단, service_role만 우회 접근.
-- platform: 'fnb' | 'dining', store: 매장 id 문자열(chdo/euwb/sbgb/smjp/dwmc).
-- ============================================================================

create table if not exists public.store_vendors (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null,
  store       text not null,
  cat         text not null default '식자재',
  name        text not null,
  contact     text,
  phone       text,
  items       text,
  terms       text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_store_vendors_pf on public.store_vendors(platform);
alter table public.store_vendors enable row level security;

create table if not exists public.store_order_links (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null,
  store       text not null,
  cat         text not null default '기타',
  name        text not null,
  url         text not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_store_links_pf on public.store_order_links(platform);
alter table public.store_order_links enable row level security;
