-- ============================================================================
-- 0086 — 커머스 마케팅 플랜. 브랜드·제품별 시장분석 → 시딩/SEO 제안 →
-- 예상매출·시즈널 1년 추정을 한 문서로 저장한다.
-- 화면은 public/commerce-interview 정적 앱, 저장/불러오기만 이 표를 쓴다.
-- ============================================================================

create table if not exists public.commerce_interviews (
  id          uuid primary key default gen_random_uuid(),
  doc_no      text not null unique,          -- UNHO2026.0819.0001
  client      text not null default '',      -- 브랜드/거래처명
  product     text not null default '',      -- 대표 제품명(첫 탭)
  brand_slug  text,                          -- brands.slug (선택)
  status      text not null default '임시저장'
              check (status in ('임시저장', '검토', '확정', '보관')),
  ver         integer not null default 1,    -- 저장 횟수
  summary     jsonb not null default '{}'::jsonb,  -- 목록 표시용 요약
  state       jsonb not null default '{}'::jsonb,  -- 화면 전체 입력값
  created_by  uuid references public.users(id) on delete set null,
  updated_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_ci_updated on public.commerce_interviews(updated_at desc);
create index if not exists idx_ci_client on public.commerce_interviews(client);

drop trigger if exists trg_ci_touch on public.commerce_interviews;
create trigger trg_ci_touch before update on public.commerce_interviews
  for each row execute function public.touch_updated_at();

alter table public.commerce_interviews enable row level security;

-- 자사(대표·직원)만. 외주업체(vendor)·게스트는 접근 불가.
drop policy if exists ci_all on public.commerce_interviews;
create policy ci_all on public.commerce_interviews
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
