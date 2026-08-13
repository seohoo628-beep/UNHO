-- ============================================================================
-- 0025 — F&B/다이닝 자료실 업로드 파일(store_assets).
-- 사용자가 직접 올린 디자인·메뉴·포스터·영상·문서 파일 메타데이터. 파일은 공개 버킷
-- 'generated-media'에 저장(asset-files/...). service_role 서버 액션으로만 접근.
-- ============================================================================

create table if not exists public.store_assets (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null,
  store       text not null default 'all',
  section     text not null default 'design',   -- design/menu/poster/video/plan
  title       text,
  file_name   text not null,
  file_path   text not null,
  kind        text not null default 'doc',       -- image/video/doc
  created_at  timestamptz not null default now()
);
create index if not exists idx_store_assets_pf on public.store_assets(platform, store);
alter table public.store_assets enable row level security;
-- 정책 없음 → service_role(서버 액션)만 접근.
