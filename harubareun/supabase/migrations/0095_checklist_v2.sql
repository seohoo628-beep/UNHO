-- ============================================================================
-- 0095 — 오늘의 체크리스트 고도화
--   ① 관리자 편집 + 역할별 노출  ② 개인별 완료 트래킹
--   ③ 주간·월간 반복 항목        ④ 주간 달성률·streak
-- ============================================================================

-- 항목 템플릿(대표/관리자가 편집).
create table if not exists public.checklist_items (
  id          uuid primary key default gen_random_uuid(),
  group_name  text not null default '운영',
  label       text not null,
  href        text,
  role        text,                                  -- null=전원 / 'manager','designer','marketer','bm','md','owner'
  recurrence  text not null default 'daily'          -- daily / weekly / monthly
              check (recurrence in ('daily','weekly','monthly')),
  weekday     int,                                   -- weekly: 0=일 .. 6=토 (JS getDay 기준)
  month_day   int,                                   -- monthly: 1..31
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists checklist_items_order_idx on public.checklist_items(sort_order, created_at);

-- 완료 기록(개인별). check_date + item + user 별 1행.
create table if not exists public.checklist_marks (
  check_date  date not null,
  item_id     uuid not null references public.checklist_items(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (check_date, item_id, user_id)
);
create index if not exists checklist_marks_date_idx on public.checklist_marks(check_date);
create index if not exists checklist_marks_user_idx on public.checklist_marks(user_id, check_date);

alter table public.checklist_items enable row level security;
alter table public.checklist_marks enable row level security;

-- 읽기: owner/staff. 항목 편집: owner만. (완료 토글은 서비스 클라이언트로 처리)
drop policy if exists checklist_items_read on public.checklist_items;
create policy checklist_items_read on public.checklist_items for select to authenticated
  using (public.current_app_role() in ('owner','staff'));
drop policy if exists checklist_items_write on public.checklist_items;
create policy checklist_items_write on public.checklist_items for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

drop policy if exists checklist_marks_all on public.checklist_marks;
create policy checklist_marks_all on public.checklist_marks for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

-- 기존 하드코딩 항목 시드(최초 1회, 비어있을 때만).
insert into public.checklist_items (group_name, label, href, role, recurrence, sort_order)
select v.group_name, v.label, v.href, v.role, 'daily', v.ord
from (values
  ('운영', '업무투두 최신화', '/todos', null, 10),
  ('운영', '일일확인시트별 점검', '/drive', null, 20),
  ('운영', '거래처별 단체톡 팔로업', null, null, 30),
  ('운영', '경영지원 업무일지 작성', '/work-logs', 'manager', 40),
  ('운영', '디자이너 업무일지 작성', '/work-logs', 'designer', 50),
  ('운영', '마케터 업무일지 작성', '/work-logs', 'marketer', 60),
  ('운영', 'BM 업무일지 작성', '/work-logs', 'bm', 70),
  ('콘텐츠·마케팅', '브랜딩·광고 콘텐츠 업로드', '/dashboard', 'designer', 80),
  ('콘텐츠·마케팅', '리뷰 답글 (채널별)', null, null, 90),
  ('콘텐츠·마케팅', 'Q&A·문의 체크', null, null, 100),
  ('콘텐츠·마케팅', '채널별 상세페이지 점검', null, null, 110),
  ('SEO 최적화', '제목·키워드 점검', null, null, 120),
  ('SEO 최적화', '메타·설명문 점검', null, null, 130),
  ('SEO 최적화', '이미지 alt·파일명', null, null, 140),
  ('SEO 최적화', '상세페이지 키워드 반영', null, null, 150),
  ('SEO 최적화', '내부링크·연관상품 연결', null, null, 160),
  ('재무·CS', 'CS·클레임 처리 확인', null, null, 170)
) as v(group_name, label, href, role, ord)
where not exists (select 1 from public.checklist_items);
