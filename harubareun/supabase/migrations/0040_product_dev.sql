-- ============================================================================
-- 0040 — 제품개발 파이프라인. 아이디어 → 기획 → 샘플 → 검토 → 양산 → 출시.
-- ============================================================================

create table if not exists public.product_developments (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,                  -- 제품(개발건)명
  brand_id       uuid references public.brands(id) on delete set null,
  category       text,                           -- 카테고리(식품/뷰티/생활 등)
  stage          text not null default '아이디어'
                 check (stage in ('아이디어','기획','샘플','검토','양산','출시','보류')),
  target_date    date,                           -- 목표 출시일
  cost_estimate  bigint,                         -- 예상 원가/개발비
  vendor_id      uuid references public.vendors(id) on delete set null,  -- 제조/개발 파트너
  link           text,                           -- 참고 링크
  note           text,
  owner_user_id  uuid references public.users(id) on delete set null,    -- 담당자
  launched_at    date,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists prod_dev_stage_idx on public.product_developments(stage);
create index if not exists prod_dev_brand_idx on public.product_developments(brand_id);

alter table public.product_developments enable row level security;
drop policy if exists product_developments_all on public.product_developments;
create policy product_developments_all on public.product_developments for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
