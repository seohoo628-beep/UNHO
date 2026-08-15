-- ============================================================================
-- 0083 — 콘텐츠 결과물: 실제 디자이너가 만든 브랜딩·광고 콘텐츠 업로드 보관소
-- (자동승인·자동기획·제품실제컷 폴더 제거에 따라 콘텐츠 결과물만 남기고 용도 전환)
-- ============================================================================

create table if not exists public.content_gallery (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid references public.brands(id) on delete set null,
  category     text not null default '브랜딩',   -- 브랜딩 / 광고 / SNS / 상세페이지 / 기타
  title        text,                              -- 설명
  storage_path text not null,                     -- generated-media 버킷 경로
  file_name    text,
  mime         text,
  uploaded_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists content_gallery_brand_idx on public.content_gallery(brand_id);
create index if not exists content_gallery_created_idx on public.content_gallery(created_at desc);

alter table public.content_gallery enable row level security;
drop policy if exists content_gallery_all on public.content_gallery;
create policy content_gallery_all on public.content_gallery for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
