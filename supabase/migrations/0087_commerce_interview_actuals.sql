-- ============================================================================
-- 0087 — 커머스 인터뷰지 계획 대비 실적. 문서·제품·주차 단위로 실제 수치를
-- 기록해 ±30% 밴드 안에 들어왔는지 사후 검증한다.
-- 여기 쌓인 값이 다음 제품의 전환율·행사 배수 가정을 경험치로 대체한다.
-- ============================================================================

create table if not exists public.commerce_interview_actuals (
  id           uuid primary key default gen_random_uuid(),
  doc_no       text not null references public.commerce_interviews(doc_no) on delete cascade,
  product_idx  integer not null default 0,     -- 제품 탭 순번(0-base)
  week_no      integer not null,               -- 프로젝트 1주차부터
  week_start   date not null,
  sales_qty    numeric,                        -- 실제 판매량(주)
  reviews      numeric,                        -- 실제 누적 리뷰수
  rank_pos     integer,                        -- 대표 키워드 노출 순위
  revenue      numeric,                        -- 실제 매출(주)
  note         text,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (doc_no, product_idx, week_no)
);
create index if not exists idx_cia_doc on public.commerce_interview_actuals(doc_no, product_idx, week_no);

drop trigger if exists trg_cia_touch on public.commerce_interview_actuals;
create trigger trg_cia_touch before update on public.commerce_interview_actuals
  for each row execute function public.touch_updated_at();

alter table public.commerce_interview_actuals enable row level security;

drop policy if exists cia_all on public.commerce_interview_actuals;
create policy cia_all on public.commerce_interview_actuals
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
