-- ============================================================================
-- 0011 — 제품컷 라이브러리. 브랜드별 실제 제품 사진을 올려두고 디자이너 에이전트가
-- 배치 지시서에 활용한다. 파일은 Storage 공개 버킷 'generated-media' 재사용.
-- ============================================================================

create table if not exists public.product_shots (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands(id) on delete cascade,
  storage_path text not null,
  file_name    text,
  label        text,                -- 컷 설명(예: 정면컷, 성분컷)
  uploaded_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_shots_brand on public.product_shots(brand_id);

alter table public.product_shots enable row level security;

drop policy if exists shots_all on public.product_shots;
create policy shots_all on public.product_shots
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
