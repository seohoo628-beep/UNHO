-- ============================================================================
-- 0081 — 마케팅보드 반영: 목표설정 / 이벤트 관리 / 채널자산 KPI
-- ============================================================================

-- 1) 매출 목표 (연/월/법인별) ------------------------------------------------
create table if not exists public.revenue_goals (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null default '전사',        -- 전사 / 하루바른 / 나아
  metric      text not null,                        -- 지표명
  value       numeric,                              -- 목표값
  unit        text,                                 -- 원 / 명 / 개월 등
  sort_order  int not null default 0,
  note        text,
  updated_at  timestamptz not null default now()
);
alter table public.revenue_goals enable row level security;
drop policy if exists revenue_goals_all on public.revenue_goals;
create policy revenue_goals_all on public.revenue_goals for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

delete from public.revenue_goals where note like '%⟦보드시드⟧%';
insert into public.revenue_goals (scope, metric, value, unit, sort_order, note) values
  ('전사','연매출 목표', 10000000000,'원',1,'대표 지시값 ⟦보드시드⟧'),
  ('전사','월매출 목표',   833333333,'원',2,'연매출 ÷ 12 ⟦보드시드⟧'),
  ('전사','일평균매출 목표', 27777778,'원',3,'월매출 ÷ 30 ⟦보드시드⟧'),
  ('전사','목표 영업이익', 1000000000,'원',4,'기대수익률 10% ⟦보드시드⟧'),
  ('전사','적정 직원수',          10,'명',5,'1인당 연 10억 기준 ⟦보드시드⟧'),
  ('하루바른','연매출 목표', 6000000000,'원',10,'비중 60% · 2026-09 런칭 ⟦보드시드⟧'),
  ('하루바른','월평균 목표',  500000000,'원',11,'12개월 가동 ⟦보드시드⟧'),
  ('나아','연매출 목표',     4000000000,'원',20,'비중 40% · 2027-03 런칭 ⟦보드시드⟧'),
  ('나아','월평균 목표',      333333333,'원',21,'기준기간 내 6개월 가동 ⟦보드시드⟧'),
  ('나아','가동월 기준 월매출', 666666667,'원',22,'6개월 가동 환산 ⟦보드시드⟧');

-- 2) 마케팅 이벤트 (이벤트DB) --------------------------------------------------
create table if not exists public.marketing_events (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid references public.brands(id) on delete set null,
  status         text not null default '예정' check (status in ('예정','진행','완료','보류')),
  title          text not null,                     -- 이벤트명
  rationale      text,                              -- 명분
  benefit_type   text,                              -- 혜택유형
  channel        text,
  start_date     date,
  end_date       date,
  target_revenue bigint,                            -- 목표매출
  actual_revenue bigint,                            -- 실적매출
  buyers         int,                               -- 구매고객수
  ad_cost        bigint,                            -- 광고비
  note           text,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists marketing_events_brand_idx on public.marketing_events(brand_id);
alter table public.marketing_events enable row level security;
drop policy if exists marketing_events_all on public.marketing_events;
create policy marketing_events_all on public.marketing_events for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

-- 3) 채널자산 KPI ------------------------------------------------------------
create table if not exists public.channel_kpis (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid references public.brands(id) on delete set null,
  category     text not null,                       -- 리뷰 / CRM / SEO / 콘텐츠 / 채널
  metric       text not null,                       -- 지표
  target       numeric,                             -- 목표
  current      numeric not null default 0,          -- 현재값
  target_date  date,
  performer    text,                                -- 수행 주체
  note         text,
  sort_order   int not null default 0,
  updated_at   timestamptz not null default now()
);
create index if not exists channel_kpis_brand_idx on public.channel_kpis(brand_id);
alter table public.channel_kpis enable row level security;
drop policy if exists channel_kpis_all on public.channel_kpis;
create policy channel_kpis_all on public.channel_kpis for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

delete from public.channel_kpis where note like '%⟦보드시드⟧%';
insert into public.channel_kpis (brand_id, category, metric, target, current, target_date, performer, note, sort_order)
select b.id, v.category, v.metric, v.target, 0, v.tdate::date, v.performer, v.note, v.so
from (values
  ('hb','리뷰','자사몰+스마트스토어 리뷰·구매건수',2000,'2026-09-30','스카이벤처스','실구매 기반만 ⟦보드시드⟧',1),
  ('hb','리뷰','쿠팡 리뷰',2000,'2026-12-31','스카이벤처스','로켓 입점 후 ⟦보드시드⟧',2),
  ('hb','CRM','카카오 채널 친구',30000,'2026-11-30','스카이벤처스','획득 단가 계약서 명시 ⟦보드시드⟧',3),
  ('hb','CRM','스마트스토어 알림받기',50000,'2026-12-31','내부','쿠폰 단가 마진표 반영 ⟦보드시드⟧',4),
  ('hb','SEO','최적화 블로거 발행',10,'2026-09-10','스카이벤처스','광고 표기 필수 ⟦보드시드⟧',5),
  ('hb','콘텐츠','유튜브 2차활용 PPL',5,'2026-10-31','대표 네트워크','대표 직접 실행 ⟦보드시드⟧',6),
  ('hb','채널','판매 채널 입점 수',6,'2026-12-31','내부','자사몰·스토어·쿠팡·카카오·올영·무신사 ⟦보드시드⟧',7),
  ('na','리뷰','자사몰+스마트스토어 리뷰·구매건수',2000,'2027-04-30','스카이벤처스','실구매 기반만 ⟦보드시드⟧',10),
  ('na','리뷰','쿠팡 리뷰',2000,'2027-06-30','스카이벤처스','⟦보드시드⟧',11),
  ('na','리뷰','화해·글로우픽 리뷰',500,'2027-04-30','내부','올리브영 입점 심사에 영향 ⟦보드시드⟧',12),
  ('na','CRM','카카오 채널 친구',30000,'2027-06-30','스카이벤처스','⟦보드시드⟧',13),
  ('na','CRM','스마트스토어 알림받기',50000,'2027-07-31','내부','⟦보드시드⟧',14),
  ('na','SEO','최적화 블로거 발행',10,'2027-03-15','스카이벤처스','광고 표기 필수 ⟦보드시드⟧',15)
) as v(slug, category, metric, target, tdate, performer, note, so)
join public.brands b on b.slug = v.slug;
