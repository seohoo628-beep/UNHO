-- ============================================================
-- 하루바른·나아 플랫폼 DB 설정 통합본 — setup/setup_3of3.sql
-- Supabase SQL Editor에 통째로 붙여넣고 Run 하세요.
-- ============================================================

-- ▼▼▼ migrations/0050_partner_rooms.sql ▼▼▼
-- ============================================================================
-- 0050 — 파트너별 분리(회사별 방). 게스트는 자기 소속 회사 방만 열람/작성.
-- ============================================================================

create table if not exists public.partner_companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.partner_companies enable row level security;
drop policy if exists partner_companies_select on public.partner_companies;
create policy partner_companies_select on public.partner_companies for select to authenticated
  using (public.current_app_role() in ('owner','staff','guest'));
drop policy if exists partner_companies_write on public.partner_companies;
create policy partner_companies_write on public.partner_companies for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

-- 사용자(게스트)의 소속 파트너 회사.
alter table public.users add column if not exists partner_id uuid references public.partner_companies(id) on delete set null;

-- 게시물의 소속 파트너 회사.
alter table public.partner_posts add column if not exists partner_id uuid references public.partner_companies(id) on delete set null;
create index if not exists partner_posts_partner_idx on public.partner_posts(partner_id);

-- 조회: 대표·직원 전체 / 게스트는 자기 회사 방만.
drop policy if exists partner_posts_select on public.partner_posts;
create policy partner_posts_select on public.partner_posts for select to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or (public.current_app_role() = 'guest'
        and partner_id = (select u.partner_id from public.users u where u.id = public.current_user_id()))
  );

-- 작성: 대표·직원 / 게스트는 자기 회사 방으로만.
drop policy if exists partner_posts_insert on public.partner_posts;
create policy partner_posts_insert on public.partner_posts for insert to authenticated
  with check (
    public.current_app_role() in ('owner','staff')
    or (public.current_app_role() = 'guest'
        and partner_id = (select u.partner_id from public.users u where u.id = public.current_user_id()))
  );


-- ▼▼▼ migrations/0051_partner_comments.sql ▼▼▼
-- ============================================================================
-- 0051 — 파트너 협업 게시물 댓글(양방향). 볼 수 있는 게시물에만 댓글 가능.
-- ============================================================================

create table if not exists public.partner_post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.partner_posts(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists partner_comments_post_idx on public.partner_post_comments(post_id);

alter table public.partner_post_comments enable row level security;

-- 부모 게시물을 볼 수 있는 사람만 댓글 열람/작성 가능.
drop policy if exists partner_comments_select on public.partner_post_comments;
create policy partner_comments_select on public.partner_post_comments for select to authenticated
  using (
    exists (
      select 1 from public.partner_posts p
      where p.id = post_id
        and (
          public.current_app_role() in ('owner','staff')
          or (public.current_app_role() = 'guest'
              and p.partner_id = (select u.partner_id from public.users u where u.id = public.current_user_id()))
        )
    )
  );

drop policy if exists partner_comments_insert on public.partner_post_comments;
create policy partner_comments_insert on public.partner_post_comments for insert to authenticated
  with check (
    exists (
      select 1 from public.partner_posts p
      where p.id = post_id
        and (
          public.current_app_role() in ('owner','staff')
          or (public.current_app_role() = 'guest'
              and p.partner_id = (select u.partner_id from public.users u where u.id = public.current_user_id()))
        )
    )
  );

-- 삭제: 본인 댓글 또는 대표·직원.
drop policy if exists partner_comments_delete on public.partner_post_comments;
create policy partner_comments_delete on public.partner_post_comments for delete to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or user_id = public.current_user_id()
  );


-- ▼▼▼ migrations/0052_partner_company_email.sql ▼▼▼
-- ============================================================================
-- 0052 — 파트너 회사별 연락 이메일. 새 글 알림을 이 이메일로도 발송.
-- ============================================================================

alter table public.partner_companies add column if not exists email text;


-- ▼▼▼ migrations/0053_designer_logs.sql ▼▼▼
-- ============================================================================
-- 0053 — 디자이너 업무일지. 일일업무일지 / 주간업무계획 / 월간업무계획을
--        날짜·메모·다중 첨부파일과 함께 올린다.
-- ============================================================================

create table if not exists public.designer_logs (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default '일일업무일지'
                 check (kind in ('일일업무일지','주간업무계획','월간업무계획')),
  log_date       date not null default (now() at time zone 'Asia/Seoul')::date,
  title          text,
  note           text,
  files          jsonb not null default '[]'::jsonb,
  author_user_id uuid references public.users(id) on delete set null,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists designer_logs_kind_idx on public.designer_logs(kind);
create index if not exists designer_logs_date_idx on public.designer_logs(log_date desc);

alter table public.designer_logs enable row level security;
drop policy if exists designer_logs_all on public.designer_logs;
create policy designer_logs_all on public.designer_logs for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0054_ceo_todo_isolation.sql ▼▼▼
-- ============================================================================
-- 0054 — CEO 투두를 DB 레벨에서 최운호 본인으로 격리.
--   기존 정책은 owner 역할 전체 허용이라, 다른 owner 계정이 브라우저에서
--   직접 조회하면 CEO 개인 보드가 열렸다. is_ceo 플래그 + 헬퍼 함수로 잠근다.
--
--   ⚠️ 적용 후 반드시 CEO 계정에 플래그를 켜야 한다:
--      update public.users set is_ceo = true where email = '대표이메일';
--   (플래그를 켠 계정이 없으면 아무도 CEO 투두에 접근하지 못한다.)
-- ============================================================================

alter table public.users
  add column if not exists is_ceo boolean not null default false;

-- 현재 세션 사용자가 CEO인지. SECURITY DEFINER 로 users RLS 재귀 방지.
create or replace function public.current_user_is_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_ceo from public.users
      where auth_id = auth.uid() and active = true
      limit 1),
    false);
$$;

drop policy if exists ceo_todos_owner on public.ceo_todos;
drop policy if exists ceo_todos_ceo on public.ceo_todos;
create policy ceo_todos_ceo on public.ceo_todos
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());


-- ▼▼▼ migrations/0055_realtime_ai_outputs.sql ▼▼▼
-- ============================================================================
-- 0055 — 실시간 반영에 ai_outputs 추가. 새 AI 콘텐츠 승인건이 생기면
--   대표 승인 배지가 자동 갱신되도록 퍼블리케이션에 등록.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_outputs'
  ) then
    execute 'alter publication supabase_realtime add table public.ai_outputs';
  end if;
end $$;


-- ▼▼▼ migrations/0056_ceo_mandalart.sql ▼▼▼
-- ============================================================================
-- 0056 — CEO 만다라트(연꽃기법) 목표표. 9×9(81칸)을 jsonb 배열로 저장.
--   CEO 본인만 접근(0054의 current_user_is_ceo 재사용).
-- ============================================================================

-- 0054가 아직 적용 안 됐을 수도 있으므로 함수를 여기서도 보장(멱등).
create or replace function public.current_user_is_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_ceo from public.users
      where auth_id = auth.uid() and active = true
      limit 1),
    false);
$$;

create table if not exists public.ceo_mandalart (
  id         text primary key default 'main',
  cells      jsonb not null default '[]'::jsonb,   -- 길이 81 문자열 배열
  updated_at timestamptz not null default now()
);

alter table public.ceo_mandalart enable row level security;
drop policy if exists ceo_mandalart_ceo on public.ceo_mandalart;
create policy ceo_mandalart_ceo on public.ceo_mandalart
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());


-- ▼▼▼ migrations/0057_promotions.sql ▼▼▼
-- ============================================================================
-- 0057 — 이벤트·프로모션 기획/결과. 주·월·연 단위로 기획하고 결과를 입력.
-- ============================================================================

create table if not exists public.promotions (
  id           uuid primary key default gen_random_uuid(),
  period_type  text not null default '월' check (period_type in ('주','월','연')),
  period_label text,                       -- 예) 2026-W32 / 2026-08 / 2026
  title        text not null,              -- 기획명
  channel      text,                       -- 채널
  plan         text,                       -- 기획 내용
  budget       bigint,                     -- 예산
  result       text,                       -- 결과 입력
  outcome      text,                       -- 성과 수치(매출·참여 등)
  status       text not null default '예정' check (status in ('예정','진행','완료','보류')),
  start_date   date,
  end_date     date,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists promotions_period_idx on public.promotions(period_type);
create index if not exists promotions_created_idx on public.promotions(created_at desc);

alter table public.promotions enable row level security;
drop policy if exists promotions_all on public.promotions;
create policy promotions_all on public.promotions for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0058_revenue_plans.sql ▼▼▼
-- ============================================================================
-- 0058 — 매출증대방안. 유입·체류 / 전환 / 재구매 레버별 플랜과 기록을
--        일·주·월 단위로 관리.
-- ============================================================================

create table if not exists public.revenue_plans (
  id           uuid primary key default gen_random_uuid(),
  period_type  text not null default '주' check (period_type in ('일','주','월')),
  period_label text,                       -- 예) 2026-08-09 / 2026-W32 / 2026-08
  lever        text not null default '유입·체류'
               check (lever in ('유입·체류','전환','재구매')),
  title        text not null,              -- 플랜명/주제
  plan         text,                       -- 개선 플랜
  record       text,                       -- 실행 기록/결과
  target       text,                       -- 목표 지표
  actual       text,                       -- 실제 지표
  status       text not null default '예정' check (status in ('예정','진행','완료','보류')),
  log_date     date,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists revenue_plans_period_idx on public.revenue_plans(period_type);
create index if not exists revenue_plans_lever_idx on public.revenue_plans(lever);
create index if not exists revenue_plans_created_idx on public.revenue_plans(created_at desc);

alter table public.revenue_plans enable row level security;
drop policy if exists revenue_plans_all on public.revenue_plans;
create policy revenue_plans_all on public.revenue_plans for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0059_contacts.sql ▼▼▼
-- ============================================================================
-- 0059 — 인맥관리(대표 개인). CEO 본인만 접근(0054의 current_user_is_ceo 재사용).
-- ============================================================================

-- 0054 미적용 대비 함수 보장(멱등).
create or replace function public.current_user_is_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_ceo from public.users
      where auth_id = auth.uid() and active = true
      limit 1),
    false);
$$;

create table if not exists public.contacts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,            -- 이름
  job            text,                     -- 직업
  company        text,                     -- 회사명
  contact        text,                     -- 연락처
  birthday       text,                     -- 생일(예: 1988-03-14 / 3/14 / 음력)
  where_met      text,                     -- 만난 곳/관계
  marital        text,                     -- 결혼 유무(미혼/기혼/기타)
  has_children   boolean not null default false,  -- 자녀 유무
  children_names text,                     -- 자녀 이름
  note           text,                     -- 메모
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists contacts_name_idx on public.contacts(name);

alter table public.contacts enable row level security;
drop policy if exists contacts_ceo on public.contacts;
create policy contacts_ceo on public.contacts
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());


-- ▼▼▼ migrations/0060_contacts_category.sql ▼▼▼
-- ============================================================================
-- 0060 — 인맥관리 직업군 분류. category 컬럼 추가.
--   값: 기업인 / 연예인 / 인플루언서 / 전문직 / 투자관련 / 기타
-- ============================================================================

alter table public.contacts
  add column if not exists category text;

-- 직책(직급) 컬럼도 함께 추가.
alter table public.contacts
  add column if not exists title text;

create index if not exists contacts_category_idx on public.contacts(category);


-- ▼▼▼ migrations/0061_contacts_details.sql ▼▼▼
-- ============================================================================
-- 0061 — 인맥관리 상세 필드 추가: 고향/학력/연락처2/소속사/그룹·대표작/집주소/
--         이메일/출생연도.
-- ============================================================================

alter table public.contacts add column if not exists hometown text;    -- 고향
alter table public.contacts add column if not exists education text;    -- 학력
alter table public.contacts add column if not exists contact2 text;     -- 연락처2
alter table public.contacts add column if not exists agency text;       -- 소속사
alter table public.contacts add column if not exists group_work text;   -- 그룹명·대표작
alter table public.contacts add column if not exists address text;      -- 집주소
alter table public.contacts add column if not exists email text;        -- 이메일
alter table public.contacts add column if not exists birth_year int;    -- 출생연도


-- ▼▼▼ migrations/0062_commerce_lectures.sql ▼▼▼
-- ============================================================================
-- 0062 — 커머스강의 자료 폴더. 강의 파일·링크·메모 보관.
-- ============================================================================

create table if not exists public.commerce_lectures (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text,                       -- 강의명/플랫폼/분류
  note        text,
  link        text,
  files       jsonb not null default '[]'::jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists commerce_lectures_created_idx on public.commerce_lectures(created_at desc);

alter table public.commerce_lectures enable row level security;
drop policy if exists commerce_lectures_all on public.commerce_lectures;
create policy commerce_lectures_all on public.commerce_lectures for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0063_morning_briefs.sql ▼▼▼
-- ============================================================================
-- 0063 — CEO 아침 브리핑 보관. 매일 생성된 브리핑(HTML)을 날짜별로 저장.
--   CEO 본인만 열람(0054의 current_user_is_ceo 재사용).
-- ============================================================================

create or replace function public.current_user_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ceo from public.users where auth_id = auth.uid() and active = true limit 1), false);
$$;

create table if not exists public.morning_briefs (
  id          uuid primary key default gen_random_uuid(),
  brief_date  date not null unique,
  html        text not null,
  summary     text,
  created_at  timestamptz not null default now()
);
create index if not exists morning_briefs_date_idx on public.morning_briefs(brief_date desc);

alter table public.morning_briefs enable row level security;
drop policy if exists morning_briefs_ceo on public.morning_briefs;
create policy morning_briefs_ceo on public.morning_briefs
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());


-- ▼▼▼ migrations/0064_assets_folder.sql ▼▼▼
-- ============================================================================
-- 0064 — 각종 자료(product_assets)에 사용자 지정 폴더 컬럼 추가.
-- ============================================================================

alter table public.product_assets add column if not exists folder text;
create index if not exists product_assets_folder_idx on public.product_assets(folder);


-- ▼▼▼ migrations/0065_asset_folders.sql ▼▼▼
-- ============================================================================
-- 0065 — 각종 자료 폴더 목록(빈 폴더도 만들 수 있도록 별도 저장).
-- ============================================================================

create table if not exists public.asset_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

alter table public.asset_folders enable row level security;
drop policy if exists asset_folders_all on public.asset_folders;
create policy asset_folders_all on public.asset_folders for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0066_tiktok_leads.sql ▼▼▼
-- ============================================================================
-- 0066 — 틱톡 영업 리스트(대표 개인). CEO 본인만 접근(0054의 current_user_is_ceo 재사용).
--        인맥관리(contacts)와 동일한 형식·권한. 영업 파이프라인용 필드로 구성.
-- ============================================================================

-- 0054 미적용 대비 함수 보장(멱등).
create or replace function public.current_user_is_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_ceo from public.users
      where auth_id = auth.uid() and active = true
      limit 1),
    false);
$$;

create table if not exists public.tiktok_leads (
  id          uuid primary key default gen_random_uuid(),
  handle      text,                     -- 계정명(@핸들)
  name        text,                     -- 담당자/실명
  category    text,                     -- 분야(뷰티/패션/음식 등)
  stage       text,                     -- 영업단계(미접촉/DM발송/협의중/계약완료 등)
  followers   integer,                  -- 팔로워 수
  product     text,                     -- 제안 제품
  contact     text,                     -- 연락처
  contact2    text,                     -- 연락처2
  email       text,                     -- 이메일
  link        text,                     -- 틱톡 링크
  agency      text,                     -- 소속사/MCN
  source      text,                     -- 유입경로/발견처
  note        text,                     -- 메모
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tiktok_leads_handle_idx on public.tiktok_leads(handle);
create index if not exists tiktok_leads_stage_idx on public.tiktok_leads(stage);

alter table public.tiktok_leads enable row level security;
drop policy if exists tiktok_leads_ceo on public.tiktok_leads;
create policy tiktok_leads_ceo on public.tiktok_leads
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());


-- ▼▼▼ migrations/0067_business_cards.sql ▼▼▼
-- ============================================================================
-- 0067 — 명함목록(리멤버 방식). 명함 사진 + 구조화 필드 + AI 자동인식.
--        대표 개인 전용(0054의 current_user_is_ceo 재사용).
-- ============================================================================

-- 0054 미적용 대비 함수 보장(멱등).
create or replace function public.current_user_is_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_ceo from public.users
      where auth_id = auth.uid() and active = true
      limit 1),
    false);
$$;

create table if not exists public.business_cards (
  id           uuid primary key default gen_random_uuid(),
  name         text,                     -- 이름
  company      text,                     -- 회사
  department   text,                     -- 부서
  position     text,                     -- 직책
  mobile       text,                     -- 휴대폰
  office_phone text,                     -- 회사전화
  email        text,                     -- 이메일
  fax          text,                     -- 팩스
  address      text,                     -- 주소
  website      text,                     -- 홈페이지
  tags         text,                     -- 태그(콤마 구분)
  image_url    text,                     -- 명함 이미지 URL
  met_date     text,                     -- 만난 날짜/획득일
  note         text,                     -- 메모
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists business_cards_name_idx on public.business_cards(name);
create index if not exists business_cards_company_idx on public.business_cards(company);

alter table public.business_cards enable row level security;
drop policy if exists business_cards_all on public.business_cards;
drop policy if exists business_cards_ceo on public.business_cards;
create policy business_cards_ceo on public.business_cards
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());


-- ▼▼▼ migrations/0068_business_cards_meta.sql ▼▼▼
-- ============================================================================
-- 0068 — 명함목록: 등록일·위치(획득 장소) 필드 추가.
-- ============================================================================

alter table public.business_cards add column if not exists registered_date text;  -- 등록일(YYYY-MM-DD)
alter table public.business_cards add column if not exists location text;          -- 획득 위치(현재 위치 자동)


-- ▼▼▼ migrations/0069_reminders.sql ▼▼▼
-- ============================================================================
-- 0069 — 리마인드(대표 개인). CEO 본인만 접근. CEO 투두의 '리마인드' 우선순위 항목 이관.
-- ============================================================================

-- 0054 미적용 대비 함수 보장(멱등).
create or replace function public.current_user_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ceo from public.users where auth_id = auth.uid() and active = true limit 1), false);
$$;

create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  cat         text,
  done        boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.reminders enable row level security;
drop policy if exists reminders_ceo on public.reminders;
create policy reminders_ceo on public.reminders
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());

-- 1) CEO 투두에 저장돼 있던 '리마인드' 항목을 리마인드로 이관(편집·완료상태 보존) 후 삭제.
insert into public.reminders (text, cat, done)
  select text, cat, coalesce(done, false)
  from public.ceo_todos where pri = '리마인드';
delete from public.ceo_todos where pri = '리마인드';

-- 2) 위에서 이관된 게 없고(리마인드 테이블이 비어 있으면) 기본 리마인드 목록을 시드.
insert into public.reminders (text, cat)
  select v.text, v.cat from (values
    ('무조건 아침 9시 출근. AI 적극 활용. 김혜정대표 라이브협업+공동 제품개발, 매일 상세페이지·리뷰점검·채널유입 구매전환 재구매 이벤트에 집중, sns 콘텐츠 기획', '제품·브랜드'),
    ('뷰티밤·리앤밤·주당의비결·운호컴퍼니·대운·신미집 홈페이지 / 네이버·구글 seo 최적화. 제품 리뷰 1000개 이상씩 확보', '제품·브랜드'),
    ('운동, 수철 투두 작성, 영어공부, 오타이산·무당티 챙겨먹기, 독서, 보컬, 댄스, 요가, 정리정돈, 청결, 디바이스 아침저녁, 비강공명, 프로페시아·미녹시딜·메디키넷', '개인·건강'),
    ('대운목장, 신미집 미리 도입. 바로.', 'F&B 운영'),
    ('미리랑 주당의비결 협업. 미리에서 영업해서 RS', null),
    ('매출 & 이익 만들기. UC, F&B', '투자·자금'),
    ('공구 지속 어레인지, 장효윤 잘팔리게, 아마존·큐텐 재팬 집중', '유통·영업'),
    ('큐텐 재팬 시작. 치히로, 리호', null),
    ('집요하게 파기. 될때까지. 답 안보이면 과감하게 접기.', null),
    ('밥이랑 면 끊기', null),
    ('건강한 원료가 중요한 게 아니다. 무조건 맛. 대중이 이미 좋아하는 걸 좀 더 건강하게 만들자가 포인트. 식품 제조공장 인수.', null),
    ('치과 빨리. 집 빨리 내놓기. 이사업체 빨리', null),
    ('친한 사람들이랑 비즈니스 관계 엮지 말기', null),
    ('미스더필 최유정, 변정수 자료 활용.', null),
    ('미스더필 기미 키워드로 임상 특허받기. 골퍼·캐디·테니스', null),
    ('레드폴 한남 3주마다. 포마드 많이. 향수 하루 3번', null),
    ('형들·동생들한테 항상 예의있고 매너있고 배려있게. 유쾌하게 농담은 하되.', null),
    ('염동진쌤 협업', null),
    ('일본 은희누나 만나러 방문', null),
    ('강인이형 야구단', null),
    ('하키, 연예인야구단 열심히 나가기', null),
    ('에이미, 게이들 디바이스', null),
    ('경남제약 제안서 작성', null),
    ('대운목장, 신미집 오픈 파티 초대. 컨텐츠 촬영', null),
    ('SL라이프 일·한 올영·돈키호테 워킹', '유통·영업'),
    ('회사·개인 신용평가 등급 올리기', '개인·건강'),
    ('솔선수범 — 빨리 출근·늦게 퇴근', '개인·건강'),
    ('철저한 성과급 체계 구성', '원칙·전략')
  ) as v(text, cat)
  where not exists (select 1 from public.reminders);


-- ▼▼▼ migrations/0070_reminders_ceo_brand.sql ▼▼▼
-- ============================================================================
-- 0070 — 리마인드: 고정·브랜드 컬럼 추가(정렬은 0069의 sort_order 사용).
--        CEO 투두: 브랜드 컬럼 추가.
-- ============================================================================

alter table public.reminders add column if not exists pinned boolean not null default false;
alter table public.reminders add column if not exists brand text;

alter table public.ceo_todos add column if not exists brand text;


-- ▼▼▼ migrations/0071_ideas.sql ▼▼▼
-- ============================================================================
-- 0071 — 아이디어 관리(대표 개인). CEO 전용. AI·음성 입력 + 버전 기록(복원).
-- ============================================================================

create or replace function public.current_user_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ceo from public.users where auth_id = auth.uid() and active = true limit 1), false);
$$;

create table if not exists public.ideas (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  body        text,
  tags        text,
  status      text not null default '수집',   -- 수집/발전중/보류/실행
  pinned      boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.ideas enable row level security;
drop policy if exists ideas_ceo on public.ideas;
create policy ideas_ceo on public.ideas for all to authenticated
  using (public.current_user_is_ceo()) with check (public.current_user_is_ceo());

-- 버전 기록(노션식 복원). 저장/복원 시 직전 상태를 스냅샷.
create table if not exists public.idea_revisions (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references public.ideas(id) on delete cascade,
  title       text,
  body        text,
  tags        text,
  status      text,
  note        text,                            -- '저장 전'/'복원 전' 등 라벨
  created_at  timestamptz not null default now()
);
create index if not exists idea_revisions_idea_idx on public.idea_revisions(idea_id, created_at desc);
alter table public.idea_revisions enable row level security;
drop policy if exists idea_revisions_ceo on public.idea_revisions;
create policy idea_revisions_ceo on public.idea_revisions for all to authenticated
  using (public.current_user_is_ceo()) with check (public.current_user_is_ceo());


-- ▼▼▼ migrations/0072_ceo_record_revisions.sql ▼▼▼
-- ============================================================================
-- 0072 — 대표 전용 폴더 공용 버전 기록(노션식 복원). CEO 전용.
--        entity(테이블명)+record_id 별로 편집 직전 전체 행(jsonb)을 스냅샷.
-- ============================================================================

create or replace function public.current_user_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ceo from public.users where auth_id = auth.uid() and active = true limit 1), false);
$$;

create table if not exists public.ceo_record_revisions (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,          -- 예: ceo_todos, contacts, reminders, ideas
  record_id   text not null,          -- 대상 행 id(테이블마다 uuid/텍스트 혼용이라 text)
  snapshot    jsonb not null,         -- 편집/복원 직전의 전체 행
  note        text,                   -- '저장 전'/'복원 전' 등
  created_at  timestamptz not null default now()
);
-- 이전 버전(uuid)로 만들었으면 text로 변경.
alter table public.ceo_record_revisions alter column record_id type text using record_id::text;
create index if not exists ceo_rev_idx on public.ceo_record_revisions(entity, record_id, created_at desc);

alter table public.ceo_record_revisions enable row level security;
drop policy if exists ceo_rev_ceo on public.ceo_record_revisions;
create policy ceo_rev_ceo on public.ceo_record_revisions for all to authenticated
  using (public.current_user_is_ceo()) with check (public.current_user_is_ceo());


-- ▼▼▼ migrations/0073_record_revisions.sql ▼▼▼
-- ============================================================================
-- 0073 — 공용(전 직원) 폴더 버전 기록. owner/staff 접근.
--        entity(테이블명)+record_id 별로 편집 직전 전체 행(jsonb)을 스냅샷.
-- ============================================================================

create table if not exists public.record_revisions (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,          -- 예: meetings
  record_id   text not null,          -- 대상 행 id(text로 통일)
  snapshot    jsonb not null,
  note        text,
  created_at  timestamptz not null default now()
);
-- 이전 버전(uuid)로 만들었으면 text로 변경.
alter table public.record_revisions alter column record_id type text using record_id::text;
create index if not exists record_rev_idx on public.record_revisions(entity, record_id, created_at desc);

alter table public.record_revisions enable row level security;
drop policy if exists record_rev_all on public.record_revisions;
create policy record_rev_all on public.record_revisions for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0074_antiaging.sql ▼▼▼
-- ============================================================================
-- 0074 — 안티에이징 관리(대표 개인, 비공개). 시술·병원 기록용. CEO 전용.
-- ============================================================================

create or replace function public.current_user_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ceo from public.users where auth_id = auth.uid() and active = true limit 1), false);
$$;

create table if not exists public.antiaging_logs (
  id          uuid primary key default gen_random_uuid(),
  log_date    text,        -- 시술일(YYYY-MM-DD)
  hospital    text,        -- 병원/의원
  treatment   text,        -- 시술/관리 내역
  doctor      text,        -- 담당 원장
  area        text,        -- 부위
  cost        integer,     -- 비용(원)
  next_date   text,        -- 다음 예정/재방문
  note        text,        -- 효과·후기·메모
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists antiaging_date_idx on public.antiaging_logs(log_date desc);

alter table public.antiaging_logs enable row level security;
drop policy if exists antiaging_ceo on public.antiaging_logs;
create policy antiaging_ceo on public.antiaging_logs for all to authenticated
  using (public.current_user_is_ceo()) with check (public.current_user_is_ceo());


-- ▼▼▼ migrations/0075_antiaging_kind.sql ▼▼▼
-- ============================================================================
-- 0075 — 안티에이징 관리: 종류(시술/영양제/운동/기타) 컬럼 추가.
-- ============================================================================

alter table public.antiaging_logs add column if not exists kind text not null default '시술';
create index if not exists antiaging_kind_idx on public.antiaging_logs(kind);


-- ▼▼▼ migrations/0076_work_logs.sql ▼▼▼
-- ============================================================================
-- 0076 — 마케터 / BM / MD 업무일지. designer_logs·manager_logs 와 동일 구조.
--        일일업무일지 / 주간업무계획 / 월간업무계획 + 날짜·메모·다중 첨부.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array['marketer_logs','bm_logs','md_logs'] loop
    execute format($f$
      create table if not exists public.%I (
        id             uuid primary key default gen_random_uuid(),
        kind           text not null default '일일업무일지'
                       check (kind in ('일일업무일지','주간업무계획','월간업무계획')),
        log_date       date not null default (now() at time zone 'Asia/Seoul')::date,
        title          text,
        note           text,
        files          jsonb not null default '[]'::jsonb,
        author_user_id uuid references public.users(id) on delete set null,
        created_by     uuid references public.users(id) on delete set null,
        created_at     timestamptz not null default now(),
        updated_at     timestamptz not null default now()
      );
    $f$, t);
    execute format('create index if not exists %I on public.%I(kind);', t||'_kind_idx', t);
    execute format('create index if not exists %I on public.%I(log_date desc);', t||'_date_idx', t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_all', t);
    execute format($p$
      create policy %I on public.%I for all to authenticated
        using (public.current_app_role() in ('owner','staff'))
        with check (public.current_app_role() in ('owner','staff'));
    $p$, t||'_all', t);
  end loop;
end $$;

-- ▼▼▼ migrations/0077_revenue_plans_brand.sql ▼▼▼
-- ============================================================================
-- 0077 — 매출증대방안(revenue_plans)에 브랜드 컬럼 추가.
--        전역 브랜드 선택(하루바른/나아)으로 필터하기 위함.
-- ============================================================================

alter table public.revenue_plans
  add column if not exists brand_id uuid references public.brands(id) on delete set null;
create index if not exists revenue_plans_brand_idx on public.revenue_plans(brand_id);

-- ▼▼▼ migrations/0078_todo_notices.sql ▼▼▼
-- ============================================================================
-- 0078 — 업무투두 상단 공지사항. 대표/직원이 올리는 짧은 공지.
-- ============================================================================

create table if not exists public.todo_notices (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  pinned      boolean not null default false,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists todo_notices_created_idx on public.todo_notices(created_at desc);

alter table public.todo_notices enable row level security;
drop policy if exists todo_notices_all on public.todo_notices;
create policy todo_notices_all on public.todo_notices for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

-- ▼▼▼ migrations/0079_haru_naa_real_data.sql ▼▼▼
-- ============================================================================
-- 0079 — 하루바른·나아 실데이터 반영 (마케팅보드/조직 자료 기반)
--   · 브랜드 상세 갱신 (카테고리·규제·주력제품·톤)
--   · 제품개발(product_developments)에 실제 제품 6종
--   · 직원(users) 조직 반영
-- 재실행 안전(upsert / not exists).
-- ============================================================================

-- ── 브랜드 상세 ──────────────────────────────────────────────────────────────
update public.brands set
  category   = '일반식품·건강기능식품',
  regulation = '식품표시광고법',
  flagship   = '서리블랙·바비컷·레몽드올리·리셀바인',
  tone       = '건강한 하루 습관. 4종은 일반식품(고형차)이라 기능성·효능 표현 금지. 원료·성분 사실 중심으로 말한다.',
  note       = '2026-09 런칭. 4종 일반식품(고형차) + 건식 예정. 객단가 3만원대. 제조 한솔(턴키).'
where slug = 'hb';

update public.brands set
  category   = '화장품',
  regulation = '화장품법',
  flagship   = '애씨드필·진정광크림',
  tone       = '조금씩 나아지는 피부. 기능성화장품은 인정 범위 내 표현만. 4세대·모낭속 균 등 오인 표현 금지.',
  note       = '2027-03 런칭 예정. 기초·기능성화장품. 객단가 상위. 책임판매관리자 선임이 크리티컬 패스.'
where slug = 'na';

-- ── 제품개발: 실제 제품 6종 ─────────────────────────────────────────────────
insert into public.product_developments (name, brand_id, category, stage, note)
select v.name, b.id, v.category, v.stage, v.note
from (values
  ('서리블랙','hb','일반식품(고형차)','샘플',
   '정제 600mg×60정 · 제조 한솔(턴키) · 주원료 발효서리태분말·검정콩추출분말 · 볶음+발효 이중공정 · 채널 자사몰·스마트스토어 · 타겟 정수리 신경쓰는 30~40대 · 일반식품이라 탈모 등 기능성 표현 금지'),
  ('바비컷','hb','일반식품(고형차)','샘플',
   '정제 600mg×60정 · 안티카브-S(알파사이클로덱스트린 외) · 식전 2정 루틴 · 채널 자사몰·스마트스토어 · 타겟 배달·야식 잦은 20~40대 · 다이어트·흡수저해 표현 금지'),
  ('레몽드올리','hb','일반식품(고형차)','샘플',
   '정제 600mg×60정 · 레몬올리브맥스(레몬과즙분말·올리브잎추출분말 외) · 아침 루틴 · 채널 자사몰·스마트스토어'),
  ('리셀바인','hb','일반식품(고형차)','보류',
   'NMN · 원료 적법성 확인 전 판매 보류(식품공전 등재/한시적 인정 확인 필요) · 세트 부속 SKU'),
  ('애씨드필','na','화장품','기획',
   '필 · AHA·BHA·PHA·LHA · 모공 케어 루틴 · 채널 자사몰·올리브영 · 타겟 모공·각질 고민층 · 4세대·모낭속 균 표현 금지'),
  ('진정광크림','na','화장품','기획',
   '크림 · 애씨드필과 연결 · 채널 자사몰·올리브영')
) as v(name, slug, category, stage, note)
join public.brands b on b.slug = v.slug
where not exists (select 1 from public.product_developments p where p.name = v.name);

-- ── 직원(조직) ──────────────────────────────────────────────────────────────
-- 대표 계정(로그인) 이름을 실제 대표로.
update public.users set name = '서현옥', job_title = '대표' where role = 'owner';

-- 나머지 구성원(이메일은 실제 계정으로 교체). role: staff.
insert into public.users (email, name, role, job_title) values
  ('choi@harubareun.com',   '최운호', 'staff', '고문'),
  ('kim@harubareun.com',    '김려은', 'staff', '총괄 BM'),
  ('cha@harubareun.com',    '차민준', 'staff', '마케터'),
  ('han@harubareun.com',    '한여정', 'staff', '디자인·ABM'),
  ('park@harubareun.com',   '박종혁', 'staff', '경영지원·마케팅'),
  ('parkbh@harubareun.com', '박병헌', 'staff', '영상 PD'),
  ('heo@harubareun.com',    '허승원', 'staff', '영상 PD')
on conflict (email) do update set
  name = excluded.name, role = excluded.role, job_title = excluded.job_title;

-- ▼▼▼ migrations/0080_launch_tasks.sql ▼▼▼
-- ============================================================================
-- 0080 — 런칭 준비/판매 To-do 시드 (하루바른·나아). 업무투두로 적재 + 담당자 배정.
--   담당(실행) 역할 → 실제 담당자: 경영지원=박종혁·BM=김려은·마케터=차민준·
--   디자이너=한여정·고문=최운호·대표이사=서현옥. MD/외부는 미배정.
--   재실행 안전(시드 태그로 교체).
-- ============================================================================

delete from public.todos where note like '%⟦런칭시드⟧%';

insert into public.todos (title, brand_id, priority, status, due_date, note, assignee_user_id)
select v.title, b.id, v.priority, '예정', v.due, v.note, u.id
from (values
  ('[자금] 법인 간 자금이동 원칙 수립 및 금전소비대차계약 서식 마련','','높음',date '2026-09-05','담당 경영지원·대표이사 · 무계약 이체는 가지급금·인정이자 과세. VC 실사 지적사항. 양 법인 공통 — 한 번만 수행 · ⟦런칭시드⟧','박종혁'),
  ('[IP] 변리사 선임 (상표·특허·디자인 일괄)','','높음',date '2026-08-18','담당 경영지원·대표이사 · 우선순위 최우선 · 수임료 확정은 대표 승인 사항. 양 법인 공통 — 한 번만 수행 · ⟦런칭시드⟧','박종혁'),
  ('[유통인프라] 3PL 물류업체 선정 및 계약','','높음',date '2026-08-22','담당 경영지원·MD·대표이사 · 우선순위 최우선 · 건기식 로트 추적 + 화장품 유통기한 관리 동시 가 능 업체. 양 법인 공통 · ⟦런칭시드⟧','박종혁'),
  ('[제조] 제조사 미팅 준비 및 진행 (쿠션·건기식·화장품)','','높음',date '2026-08-22','담당 BM·MD·고문 · 우선순위 최우선 · 소개는 고문·대표. 자료 준비와 진행은 BM. 양 법 인 공통 · ⟦런칭시드⟧','김려은'),
  ('[정부지원] 기업부설연구소 설립 신고 (KOITA)','','높음',date '2026-10-31','담당 경영지원·BM·고문 · 선행: 연구전담요원 확보 · 벤처확인·세액공제·팁스의 공통 선행조건. 법인별 각각 필요 · ⟦런칭시드⟧','박종혁'),
  ('[정부지원] 정부지원 로드맵 수립 — 연구소 → 벤처확인 → 기보 → 팁스 순서','','보통',date '2026-09-15','담당 경영지원·BM·고문 · 팁스는 운영사 추천이 병목. 인증보다 운영사 컨택 이 선행. 양 법인 공통 · ⟦런칭시드⟧','박종혁'),
  ('[리스크] 톤업 이너뷰티 세트 — 두 법인 간 거래·정산 구조 확정','','높음',date '2026-09-30','담당 경영지원·BM·대표이사 · 화장품(나아) + 건기식(하루바른) 결합 상품. 판매 주체 법인과 매입 방식 결정 · ⟦런칭시드⟧','박종혁'),
  ('[판매자격] 통신판매업 신고 (관할 구청)','hb','높음',date '2026-08-20','담당 경영지원 · 우선순위 최우선 · 선행: 사업자등록증, 구매안전서 비스 이용확인증 · 에스크로 확인증이 선행. 은행 인터넷뱅킹에서 발 급 · ⟦런칭시드⟧','박종혁'),
  ('[자금] 사업자 통장 5분할 개설 — 매출수취 / 운영지출 / 매입결제 / 세금유 보 / 조달자금','hb','높음',date '2026-08-21','담당 경영지원·대표이사 · 우선순위 최우선 · 선행: 법인 통장 개설 · 은행은 주거래 1곳으로 집중 · ⟦런칭시드⟧','박종혁'),
  ('[자금] 신설법인 한도제한계좌 해제 신청','hb','높음',date '2026-08-25','담당 경영지원 · 우선순위 최우선 · 선행: 통장 개설 · 해제 전에는 이체한도가 낮아 실무 불가. 계약서· 매출증빙 지참 · ⟦런칭시드⟧','박종혁'),
  ('[자금] 세금유보 이체 룰 세팅 — 매출수취 통장에서 월 매출의 20% 자동이 체','hb','높음',date '2026-08-28','담당 경영지원·대표이사 · 선행: 통장 5분할 · 부가세·법인세·원천세·퇴직충당 재원 · ⟦런칭시드⟧','박종혁'),
  ('[자금] 법인카드 발급 및 운영지출 통장 연결','hb','높음',date '2026-08-28','담당 경영지원 · 선행: 통장 5분할 · ⟦런칭시드⟧','박종혁'),
  ('[자금] 4대보험 성립신고','hb','높음',date '2026-08-31','담당 경영지원 · ⟦런칭시드⟧','박종혁'),
  ('[판매자격] 4종 품목제조보고 유형 확인 — 건강기능식품 / 일반식품(기타가공 품) [한솔 회신]','hb','높음',date '2026-08-16','담당 BM·고문 · 우선순위 최우선 · 선행: 제조사 회신 · 생산리스트상 기능성 신고 4종 전부 미체크. 일반 식품 유력. 전체 규제 근거의 기점 · ⟦런칭시드⟧','김려은'),
  ('[판매자격] 리셀바인(NMN) 식품원료 사용 적법성 확인 — 식품공전 등재 / 한시 적 인정 여부','hb','높음',date '2026-08-17','담당 BM·고문 · 우선순위 최우선 · 선행: 제조사 회신 · NMN은 건기식 원료 미인정. 한시적 인정이면 신 청자에게만 효력이라 사용 불가할 수 있음 · ⟦런칭시드⟧','김려은'),
  ('[판매자격] 영업자 위생교육 이수 (온라인)','hb','높음',date '2026-08-17','담당 경영지원 · 우선순위 최우선 · 판매업 신고의 선행조건 · ⟦런칭시드⟧','박종혁'),
  ('[판매자격] 건강기능식품 일반판매업 신고 (관할 시군구)','hb','높음',date '2026-08-19','담당 경영지원 · 우선순위 최우선 · 선행: 위생교육 이수, 품목 유형 확 정 · 4종 전부 일반식품이면 해당없음. 향후 건기식 취 급 대비해 선제 신고 권장 · ⟦런칭시드⟧','박종혁'),
  ('[판매자격] 품목제조보고 완료 확인 및 보고서 사본 수령','hb','높음',date '2026-08-18','담당 BM · 우선순위 최우선 · 제조사가 안 했으면 출고 자체가 불법 · ⟦런칭시드⟧','김려은'),
  ('[판매자격] 제품 표시사항(라벨) 최종 검토 — 인쇄 전','hb','높음',date '2026-08-18','담당 BM·디자이너·고문 · 우선순위 최우선 · 선행: 전성분 발행, 품목제조보고 · 전성분 미발행 상태의 문안 검수는 최종본이 아님. 재인쇄 위험 · ⟦런칭시드⟧','김려은'),
  ('[판매자격] 보부상 건기 공장 완공(27.01)과 남성활력 입고(26.10말) 일정 정합 성 확인','hb','높음',date '2026-08-22','담당 BM · 선행: 제조사 회신 · 공장 완공 전 생산 불가. 일정 모순 해소 필요 · ⟦런칭시드⟧','김려은'),
  ('[서류] 전성분 발행 요청 및 수령 — 4종','hb','높음',date '2026-08-18','담당 BM · 우선순위 최우선 · 생산리스트 미체크. 표시사항·상세페이지·PL보험· 입점서류 전부의 선행조건 · ⟦런칭시드⟧','김려은'),
  ('[서류] 자가품질검사(CT) 의뢰 및 성적서 수령 — 4종','hb','높음',date '2026-08-20','담당 BM · 우선순위 최우선 · 생산리스트상 CT 요청·완료 모두 미체크 · ⟦런칭시드⟧','김려은'),
  ('[서류] 제조사 서류 취합 ① 원료 근거 (고시형 / 개별인정형 / 일반원료), 배 합비','hb','높음',date '2026-08-18','담당 BM·고문 · 우선순위 최우선 · 개별인정형이면 사용 권한이 원료사에게만 있는지 확인 · ⟦런칭시드⟧','김려은'),
  ('[서류] 제조사 서류 취합 ② 유통기한 설정사유서, 영양성분 분석표','hb','높음',date '2026-08-18','담당 BM · 우선순위 최우선 · ⟦런칭시드⟧','김려은'),
  ('[서류] 제조사 서류 취합 ③ GMP 또는 HACCP 인증서 사본','hb','높음',date '2026-08-18','담당 BM · 우선순위 최우선 · 건기식이면 GMP 의무. 일반식품이면 HACCP · ⟦런칭시드⟧','김려은'),
  ('[서류] 인체적용시험 의뢰 여부 결정 — 4종 중 우선순위 선별','hb','높음',date '2026-08-31','담당 BM·마케터·대표이사 · 선행: 품목 유형 확정 · 일반식품은 임상 없이는 효능 소구 근거가 전무. 개 별인정형·조성물특허의 기초자료 · ⟦런칭시드⟧','김려은'),
  ('[광고심의] 4종 소구 재설계 — 탈모·다이어트·항노화·항산화 표현 대체안 확정','hb','높음',date '2026-08-18','담당 마케터·BM·고문 · 우선순위 최우선 · 선행: 품목 유형 확정 · 일반식품은 해당 표현 전부 사용 불가. 제품명은 문 제없으나 카테고리·상세페이지가 위반 · ⟦런칭시드⟧','차민준'),
  ('[런칭전략] 런칭 시나리오 확정·상신 (품목 유형 반영) BM 마케터, MD','hb','높음',date '2026-08-18','담당 대표이사 · 우선순위 최우선 · 선행: 품목 유형 확정 · 일반식품 단일 트랙 / 건기식 분리 2단계 중 결정 · ⟦런칭시드⟧','서현옥'),
  ('[광고심의] 상세페이지·SNS 문구안 작성 (대체 소구 기준)','hb','높음',date '2026-08-20','담당 마케터·BM·고문 · 우선순위 최우선 · 선행: 소구 재설계 · ⟦런칭시드⟧','차민준'),
  ('[광고심의] 건기식 표시광고 사전심의 신청 (한국건강기능식품협회)','hb','높음',date '2026-08-20','담당 마케터·BM·고문 · 선행: 건기식 품목 확정 시에만 해 당 · 일반식품이면 해당없음. 건기식 품목이 있으면 통 상 15일 내외로 8/27 불가 · ⟦런칭시드⟧','차민준'),
  ('[브랜드] BI 최종본 확정 (상표 출원용 도형 포함)','hb','높음',date '2026-08-18','담당 디자이너·마케터·대표이사 · 우선순위 최우선 · 상표 출원과 패키지 인쇄의 선행조건 · ⟦런칭시드⟧','한여정'),
  ('[브랜드] 도메인·SNS 핸들 선점 — 전 채널','hb','높음',date '2026-08-17','담당 마케터 · 우선순위 최우선 · 선행: 브랜드명 확정 · 상표 출원과 동시에. 순서가 벌어지면 선점당함 · ⟦런칭시드⟧','차민준'),
  ('[콘텐츠] 패키지 아트웍 최종 (바코드·표시사항 반영) 및 인쇄 발주','hb','높음',date '2026-08-18','담당 디자이너·BM·대표이사 · 우선순위 최우선 · 선행: GS1 바코드, 표시사항 확정 · 인쇄 발주 금액은 대표 승인 후 · ⟦런칭시드⟧','한여정'),
  ('[콘텐츠] 제품 촬영 (제품컷·연출컷·누끼)','hb','높음',date '2026-08-20','담당 디자이너·마케터 · 선행: 패키지 실물 입고 · ⟦런칭시드⟧','한여정'),
  ('[콘텐츠] 상세페이지 디자인 (승인 문구 기준)','hb','높음',date '2026-08-22','담당 디자이너·마케터·고문 · 선행: 문구안 확정 · ⟦런칭시드⟧','한여정'),
  ('[콘텐츠] SNS 계정 개설 및 초기 피드 12컷','hb','보통',date '2026-08-25','담당 마케터·디자이너 · ⟦런칭시드⟧','차민준'),
  ('[홍보] 언론보도 배포처 10곳 리스트·견적','hb','보통',date '2026-08-24','담당 마케터·대표이사 · 전재 매체 비중 확인. 검색 인덱싱 목적임을 전제 · ⟦런칭시드⟧','차민준'),
  ('[홍보] 런칭 보도자료 작성 및 배포','hb','보통',date '2026-08-27','담당 마케터·대표이사 · 선행: 런칭 시나리오 확정 · 대외 발송이므로 대표 승인 후 배포 · ⟦런칭시드⟧','차민준'),
  ('[홍보] 브랜드 검색 1페이지 장악 설계 (네이버·구글·인스타)','hb','보통',date '2026-09-10','담당 마케터·디자이너 · ⟦런칭시드⟧','차민준'),
  ('[유통인프라] GS1 회원가입 및 표준바코드(GTIN) 발급','hb','높음',date '2026-08-18','담당 BM·디자이너 · 우선순위 최우선 · 패키지 인쇄의 선행조건. 지연 시 런칭 전체가 밀림 · ⟦런칭시드⟧','김려은'),
  ('[유통인프라] SKU 코드 체계 확정','hb','높음',date '2026-08-18','담당 BM·MD · ⟦런칭시드⟧','김려은'),
  ('[유통인프라] 생산물배상책임보험(PL) 가입','hb','높음',date '2026-08-25','담당 경영지원 · 우선순위 최우선 · 선행: 전성분, CT 성적서 · 올리브영·쿠팡·대형마트 입점 요구 서류 · ⟦런칭시드⟧','박종혁'),
  ('[유통인프라] 반품·CS·교환 규정 문서화','hb','높음',date '2026-08-24','담당 BM·경영지원·대표이사 · ⟦런칭시드⟧','김려은'),
  ('[가격정책] 채널별 마진 역산표 작성 (자사몰/스마트스토어/쿠팡/공구/오프라 인)','hb','높음',date '2026-08-20','담당 MD·경영지원 · 우선순위 최우선 · 소비자가 역산. 런칭 후에는 못 고침 · ⟦런칭시드⟧',''),
  ('[가격정책] 최저가 방어(MAP) 정책 수립','hb','높음',date '2026-08-22','담당 MD·대표이사 · 선행: 마진 역산표 · ⟦런칭시드⟧',''),
  ('[가격정책] 4종 채널별 판매가 확정안 상신','hb','높음',date '2026-08-20','담당 MD·경영지원·대표이사 · 우선순위 최우선 · 선행: 마진 역산표 · 금액 최종 확정은 대표 승인 사항 · ⟦런칭시드⟧',''),
  ('[유통] 초도 발주 수량 확정 및 발주서 상신','hb','높음',date '2026-08-18','담당 MD·BM·대표이사 · 우선순위 최우선 · 선행: 판매가 승인 · 4종 SKU별 수량. 발주서 발송은 대표 승인 후 · ⟦런칭시드⟧',''),
  ('[유통] 스마트스토어·쿠팡 입점 등록','hb','높음',date '2026-08-22','담당 MD · 선행: 통신판매업 신고, 품목 유형 확정 · 건기식 카테고리는 신고증 첨부 필수 · ⟦런칭시드⟧',''),
  ('[유통] 자사몰 오픈 (결제·배송·CS 세팅 포함)','hb','높음',date '2026-08-25','담당 MD·디자이너 · 우선순위 최우선 · 선행: 통신판매업 신고 · ⟦런칭시드⟧',''),
  ('[IP] 상표 선등록 검색 — 회사명 + 4종 제품명 (국내·중국)','hb','높음',date '2026-08-18','담당 경영지원·BM·고문 · 우선순위 최우선 · 선행: 변리사 선임 · 서리블랙·바비컷·레몽드올리·리셀바인. 중국 브로 커 선점 여부 포함 · ⟦런칭시드⟧','박종혁'),
  ('[IP] 국내 상표 출원 (우선심사 청구)','hb','높음',date '2026-08-25','담당 경영지원·고문 · 우선순위 최우선 · 선행: 상표 검색, BI 확정 · 5류·29·30·32류·35류 확장 지정 · ⟦런칭시드⟧','박종혁'),
  ('[IP] 디자인권 출원 (용기·패키지 형태)','hb','높음',date '2026-08-25','담당 디자이너·경영지원·고문 · 선행: 패키지 아트웍 확정 · 공개 전 출원. 공개 후에는 신규성 상실 · ⟦런칭시드⟧','한여정'),
  ('[IP] 중국 상표 직접출원','hb','높음',date '2026-09-10','담당 경영지원·고문 · 선행: 상표 검색 · 마드리드 아닌 직접출원 권장 · ⟦런칭시드⟧','박종혁'),
  ('[IP] 조성물특허 — 한솔 턴키 계약상 처방 권리 귀속 확인','hb','높음',date '2026-09-01','담당 BM·경영지원·고문 · 우선순위 최우선 · 선행: 계약서 확보 · 공동출원이면 기보 기술평가·팁스 활용 불가 · ⟦런칭시드⟧','김려은'),
  ('[IP] 저작권 등록 (BI·대표 이미지)','hb','보통',date '2026-09-15','담당 디자이너·경영지원 · 선행: BI 확정 · ⟦런칭시드⟧','한여정'),
  ('[IP] 조성물특허 출원 (우선심사 청구)','hb','높음',date '2026-10-31','담당 BM·경영지원·고문 · 선행: 권리 귀속 확인, 인체적용시 험 · 정부지원 가점은 등록 기준. 출원만으로는 부족 · ⟦런칭시드⟧','김려은'),
  ('[IP] 미국·일본·동남아 상표 출원 (파리조약 우선권 6개월 내)','hb','보통',date '2026-12-31','담당 경영지원·고문 · 선행: 국내 출원 · ⟦런칭시드⟧','박종혁'),
  ('[IP] 아마존 Brand Registry 등록','hb','보통',null,'담당 MD · 선행: 미국 상표 등록증 · ⟦런칭시드⟧',''),
  ('[정부지원] 벤처기업확인 신청','hb','보통',date '2026-12-31','담당 경영지원·고문 · 선행: 기업부설연구소 · 연구개발유형 기준 · ⟦런칭시드⟧','박종혁'),
  ('[수출] 타겟국 바이어·유통 발굴 — 미국·중국·일본·동남아','hb','높음',null,'담당 MD·BM·대표이사 · 인증보다 바이어가 먼저. 순서를 뒤집으면 비용만 묶임 · ⟦런칭시드⟧',''),
  ('[수출] 미국 FDA 식품시설 등록 + US Agent 선임','hb','보통',null,'담당 BM·경영지원·고문 · 선행: 미국 바이어 확보 · ⟦런칭시드⟧','김려은'),
  ('[수출] 중국 진출 방식 결정안 상신 — 일반무역 / 크로스보더(CBEC)','hb','보통',null,'담당 MD·BM·대표이사 · 선행: 중국 바이어 확보 · ⟦런칭시드⟧',''),
  ('[수출] 동남아 인허가 대응 — 베트남 공표, 태국 FDA, 인니 BPOM·할랄','hb','보통',null,'담당 BM·MD·고문 · 선행: 동남아 바이어 확보 · ⟦런칭시드⟧','김려은'),
  ('[리뷰·평점] 리뷰 확보 방식 확정 — 실구매 체험단 / 리뷰 적립 이벤트 / 구매 후 CRM 유도 조합','hb','높음',date '2026-08-25','담당 마케터·MD·대표이사 · 우선순위 최우선 · 리뷰 대행·작성 방식은 표시광고법 위반이자 플랫폼 판 매정지 사유. 실구매 기반 경로만 채택 · ⟦런칭시드⟧','차민준'),
  ('[리뷰·평점] 스카이벤처스 리뷰 캠페인 계약 및 KPI 확정 (구매건수·리뷰 2,000건)','hb','높음',date '2026-08-27','담당 MD·스카이벤처스·대표이사 · 우선순위 최우선 · 선행: 리뷰 방식 확정 · 계약서에 ① 실구매 기반 명시 ② 대가 지급 시 광고·협 찬 표시 의무 ③ 어뷰징 적발 시 책임 소재 반드시 포함 · ⟦런칭시드⟧',''),
  ('[리뷰·평점] 자사몰·스마트스토어 리뷰 적립 이벤트 세팅 (포토·동영상 리뷰 차등)','hb','높음',date '2026-08-27','담당 MD·마케터 · 선행: 자사몰 오픈 · 적립금 지급도 대가에 해당. 리뷰 작성란에 표시 문구 노출 · ⟦런칭시드⟧',''),
  ('[리뷰·평점] 리뷰 원고 가이드 배포 — 금지 표현 세트 첨부','hb','높음',date '2026-08-26','담당 마케터·BM·고문 · 우선순위 최우선 · 선행: 공통 대체표현사전 · 소비자 리뷰라도 효능을 단정하면 광고주 책임. 체험단 가이드에 필수 첨부 · ⟦런칭시드⟧','차민준'),
  ('[리뷰·평점] 리뷰 2,000건 달성 (자사몰 + 스마트스토어 합산)','hb','높음',date '2026-09-30','담당 MD·스카이벤처스 · 우선순위 최우선 · 선행: 캠페인 개시 · ⟦런칭시드⟧',''),
  ('[리뷰·평점] 리뷰 품질 모니터링 — 효능 표현 리뷰 신고·블라인드 프로세스 운영','hb','높음',date '2026-09-05','담당 마케터·BM·고문 · 주 1회 점검. 적발 리뷰는 즉시 블라인드 요청 · ⟦런칭시드⟧','차민준'),
  ('[SEO] 키워드 세트 확정 — 메인 3개 / 서브 12개 (브랜드·제품·문제인식 키워드)','hb','높음',date '2026-08-25','담당 마케터·MD · 우선순위 최우선 · 선행: 소구 재설계 완료 · 메인 키워드는 블로거 10인 발행의 기준값 · ⟦런칭시드⟧','차민준'),
  ('[SEO] 네이버 서치어드바이저 · 구글 서치콘솔 등록 및 색인 요청','hb','높음',date '2026-08-27','담당 마케터 · 우선순위 최우선 · 선행: 자사몰 오픈 · ⟦런칭시드⟧','차민준'),
  ('[SEO] 네이버 SEO — 스마트스토어 상품명·태그·상세 텍스트 최적화','hb','높음',date '2026-08-27','담당 MD·마케터 · 우선순위 최우선 · 선행: 키워드 세트 · 상품명은 승인 문구 기준. 효능 키워드 삽입 금지 · ⟦런칭시드⟧',''),
  ('[SEO] 구글 SEO — 자사몰 메타태그·구조화데이터(Product 스키마)·사 이트맵','hb','높음',date '2026-09-05','담당 마케터·디자이너 · 선행: 자사몰 오픈 · ⟦런칭시드⟧','차민준'),
  ('[SEO] 브랜드 검색 1페이지 장악 점검 — 통합검색·이미지·동영상·지식 스니펫','hb','높음',date '2026-09-30','담당 마케터 · 선행: 블로거 발행 · 월 1회 정기 점검 항목으로 전환 · ⟦런칭시드⟧','차민준'),
  ('[콘텐츠·시딩] 최적화 블로거 10인 섭외 및 계약','hb','높음',date '2026-09-03','담당 마케터·스카이벤처스·대표이사 · 우선순위 최우선 · 선행: 키워드 세트 · 지수·상위노출 이력 검증 후 선정. 견적 3건 이상 비교 · ⟦런칭시드⟧','차민준'),
  ('[콘텐츠·시딩] 블로그 원고 가이드 배포 (공통 대체표현사전 첨부)','hb','높음',date '2026-09-01','담당 마케터·BM·고문 · 우선순위 최우선 · 선행: 블로거 계약 · 시딩 콘텐츠 문구도 광고주 책임. 가이드 미배포 시 위 반 위험이 10배로 늘어남 · ⟦런칭시드⟧','차민준'),
  ('[콘텐츠·시딩] 블로거 10인 발행 완료 및 메인키워드 노출 확인','hb','높음',date '2026-09-10','담당 마케터·스카이벤처스 · 우선순위 최우선 · 선행: 원고 가이드 · 본문 상단에 ''광고·협찬'' 표기 필수. 더보기 안은 미표시 로 본다 · ⟦런칭시드⟧','차민준'),
  ('[콘텐츠·시딩] 광고 소스 제작 — 영상 3종 · 이미지 10종','hb','높음',date '2026-09-05','담당 디자이너·마케터 · 선행: 제품 촬영 · 메타·네이버 DA 규격 동시 대응 · ⟦런칭시드⟧','한여정'),
  ('[콘텐츠·시딩] 유튜브 2차활용 PPL 5건 섭외 및 집행','hb','높음',date '2026-10-31','담당 대표이사·마케터 · 우선순위 최우선 · 선행: 광고 소스 · 대표 네트워크 기반 항목. 검수만 한다는 원칙의 명시적 예외. 채널별 대본은 마케터가 사전 검수 · ⟦런칭시드⟧','서현옥'),
  ('[콘텐츠·시딩] 인스타 릴스·숏폼 정기 배포 (주 3회)','hb','높음',date '2026-09-01','담당 마케터·디자이너 · 선행: SNS 계정 개설 · 런칭일부터 상시 운영 · ⟦런칭시드⟧','차민준'),
  ('[광고집행] 네이버 신제품 DA 신청 및 소재 입고','hb','높음',date '2026-08-27','담당 MD·마케터·대표이사 · 우선순위 최우선 · 선행: 광고 소스 · 심사 리드타임 사전 확인. 소재 문구는 승인 문구 세트 기준 · ⟦런칭시드⟧',''),
  ('[광고집행] 메타 광고 계정·픽셀·전환 이벤트 세팅','hb','높음',date '2026-08-25','담당 마케터·MD · 우선순위 최우선 · 선행: 자사몰 오픈 · 구매·장바구니·알림받기 전환 이벤트 분리 · ⟦런칭시드⟧','차민준'),
  ('[광고집행] 메타 광고 집행 — 프로스펙팅 / 리타게팅 캠페인 분리 운영','hb','높음',date '2026-08-27','담당 마케터·대표이사 · 우선순위 최우선 · 선행: 픽셀 세팅 · 예산 집행이므로 대표 승인 후 개시 · ⟦런칭시드⟧','차민준'),
  ('[광고집행] 네이버 검색광고 세팅 — 파워링크 · 쇼핑검색','hb','높음',date '2026-08-27','담당 MD·마케터 · 선행: 키워드 세트 · ⟦런칭시드⟧',''),
  ('[광고집행] 채널별 ROAS 주간 점검 체계 수립','hb','높음',date '2026-09-07','담당 MD·마케터 · 선행: 광고 개시 · 채널별 손익분기 ROAS를 마진 역산표에서 산출해 기 준선으로 고정 · ⟦런칭시드⟧',''),
  ('[CRM·채널자산카카오 채널 개설 및 메시지 발송 세팅] ','hb','높음',date '2026-08-25','담당 마케터 · 우선순위 최우선 · ⟦런칭시드⟧','차민준'),
  ('[CRM·채널자산카카오 채널 친구 30,000명 확보] ','hb','높음',date '2026-11-30','담당 마케터·스카이벤처스·대표이사 · 우선순위 최우선 · 선행: 채널 개설 · 확보 단가·기간·이탈 보전 조건을 계약서에 명시. 단가 확인 필요 · ⟦런칭시드⟧','차민준'),
  ('[CRM·채널자산스마트스토어 알림받기 50,000명 확보] ','hb','높음',date '2026-12-31','담당 MD·마케터·대표이사 · 우선순위 최우선 · 선행: 스토어 개설 · 알림받기 쿠폰 단가 사전 산정. 쿠폰 원가가 마진 역산 표에 반영되어야 함 · ⟦런칭시드⟧',''),
  ('[CRM·채널자산카카오·알림받기 발송 캘린더 수립 (주 1회 이상)] ','hb','높음',date '2026-09-10','담당 마케터·MD · 선행: 친구 확보 개시 · 확보만 하고 발송을 안 하면 자산이 아니라 비용 · ⟦런칭시드⟧','차민준'),
  ('[채널확장] 채널별 입점 서류 패키지 표준화 — 1세트로 전 채널 대응','hb','높음',date '2026-09-01','담당 BM·MD · 우선순위 최우선 · 선행: 전성분·CT·PL증권·GS1 · 전성분, CT 성적서, 품목제조보고서, PL증권, GS1 바 코드, 사업자·통판 신고증 · ⟦런칭시드⟧','김려은'),
  ('[채널확장] 쿠팡 로켓그로스 / 로켓배송 입점 신청','hb','높음',date '2026-09-05','담당 MD·BM·대표이사 · 우선순위 최우선 · 선행: 서류 패키지 · 입고 리드타임·수수료·반품 정책 사전 확인. 마진 역산 표에 로켓 수수료 반영 · ⟦런칭시드⟧',''),
  ('[채널확장] 쿠팡 리뷰 2,000건 확보','hb','높음',date '2026-12-31','담당 MD·스카이벤처스 · 선행: 로켓 입점 · 쿠팡은 어뷰징 탐지가 가장 강하고 제재가 즉각적이다. 실구매 기반만 · ⟦런칭시드⟧',''),
  ('[채널확장] 카카오 선물하기 입점 신청','hb','높음',date '2026-09-30','담당 MD·대표이사 · 선행: 서류 패키지 · 선물 수요 카테고리. 세트 구성 SKU 준비 필요 · ⟦런칭시드⟧',''),
  ('[채널확장] 올리브영 온라인몰 입점 제안','hb','높음',date '2026-10-15','담당 MD·BM·대표이사 · 선행: 서류 패키지 · 온라인 선진입 후 오프라인 확대가 현실적 · ⟦런칭시드⟧',''),
  ('[채널확장] 무신사 입점 제안','hb','보통',date '2026-10-31','담당 MD·대표이사 · 선행: 서류 패키지 · 카테고리 적합성 검토 선행 · ⟦런칭시드⟧',''),
  ('[채널확장] 추가 채널 입점 검토 — 컬리 · 11번가 · G마켓 · 오늘의집','hb','보통',date '2026-11-30','담당 MD · 선행: 서류 패키지 · ⟦런칭시드⟧',''),
  ('[성과관리] 주간 판매 대시보드 구축 — 채널별 매출·ROAS·리뷰수·재고','hb','높음',date '2026-09-07','담당 MD·경영지원 · 선행: 광고 개시 · UC_운영도구_P&L과 연동 · ⟦런칭시드⟧',''),
  ('[성과관리] 런칭 4주 성과 리뷰 및 예산 재배분','hb','높음',date '2026-09-24','담당 MD·마케터·대표이사 · 선행: 대시보드 · ROAS 하위 채널 예산을 상위 채널로 이관 · ⟦런칭시드⟧',''),
  ('[성과관리] 재고 소진 예측 및 2차 발주 시점 판단','hb','높음',date '2026-09-15','담당 MD·BM·대표이사 · 선행: 대시보드 · 제조 리드타임 역산. 품절이 리뷰·랭킹을 되돌린다 · ⟦런칭시드⟧',''),
  ('[브랜드] 법인·브랜드 표기 확정 — NA:AH / 나아 / 더나아','na','높음',date '2026-08-20','담당 BM·마케터·대표이사 · 우선순위 최우선 · 콜론(:)은 도메인 사용 불가, 상표 표장에도 제약. 표기 갈리면 상표·도메인·패키지가 전부 어긋남 · ⟦런칭시드⟧','김려은'),
  ('[판매자격] 책임판매관리자 채용 공고 게시','na','높음',date '2026-08-22','담당 경영지원·대표이사 · 우선순위 최우선 · 내부 유자격자 없음 확인됨. 채용 리드타임 1~2개 월. 나아의 실제 크리티컬 패스 · ⟦런칭시드⟧','박종혁'),
  ('[판매자격] 책임판매관리자 채용 확정 또는 외부 위탁 선임','na','높음',date '2026-09-30','담당 경영지원·대표이사 · 우선순위 최우선 · 선행: 채용 공고 · 10월 중 미확정 시 27.03 런칭도 불가 · ⟦런칭시드⟧','박종혁'),
  ('[판매자격] 화장품책임판매업 등록 (지방식약청)','na','높음',date '2026-10-15','담당 경영지원·고문 · 우선순위 최우선 · 선행: 책임판매관리자 선임 · ⟦런칭시드⟧','박종혁'),
  ('[판매자격] 통신판매업 신고','na','높음',date '2026-10-20','담당 경영지원 · ⟦런칭시드⟧','박종혁'),
  ('[판매자격] 기능성화장품 2종 확정 — 톤업로션(미백), 캡슐자차 선크림(자외선 차단)','na','높음',date '2026-09-15','담당 BM·고문 · 우선순위 최우선 · 선행: 처방 확정 · 리스트상 미백기능성·UV차단 명시. 심사 또는 보 고 대상 · ⟦런칭시드⟧','김려은'),
  ('[판매자격] 자외선차단지수(SPF/PA) 인체적용시험 의뢰','na','높음',date '2026-10-15','담당 BM·고문 · 우선순위 최우선 · 선행: 선크림 처방 확정 · 시험 4~8주. 13종 중 리드타임 최장. 선크림 출시 일을 결정 · ⟦런칭시드⟧','김려은'),
  ('[판매자격] 기능성화장품 심사 또는 보고 접수','na','높음',date '2026-12-15','담당 BM·고문 · 선행: 인체적용시험 결과 · 심사는 통상 60일. 보고 요건 충족 여부 먼저 확인 · ⟦런칭시드⟧','김려은'),
  ('[자금] 사업자 통장 5분할 개설 — 매출수취 / 운영지출 / 매입결제 / 세금유 보 / 조달자금','na','높음',date '2026-09-10','담당 경영지원·대표이사 · 선행: 법인 통장 개설 · 은행은 주거래 1곳으로 집중 · ⟦런칭시드⟧','박종혁'),
  ('[자금] 신설법인 한도제한계좌 해제 신청','na','높음',date '2026-09-20','담당 경영지원 · 선행: 통장 개설 · ⟦런칭시드⟧','박종혁'),
  ('[자금] 세금유보 이체 룰 세팅 — 매출수취 통장에서 월 매출의 20% 자동이 체','na','보통',date '2026-09-30','담당 경영지원·대표이사 · 선행: 통장 5분할 · ⟦런칭시드⟧','박종혁'),
  ('[자금] 법인카드 발급 및 운영지출 통장 연결','na','보통',date '2026-09-30','담당 경영지원 · 선행: 통장 5분할 · ⟦런칭시드⟧','박종혁'),
  ('[자금] 4대보험 성립신고','na','보통',date '2026-09-30','담당 경영지원 · ⟦런칭시드⟧','박종혁'),
  ('[제품] 런칭 차수·종수 확정 — 13종 동시 / 단계 분할 결정','na','높음',date '2026-08-22','담당 BM·MD·대표이사 · 우선순위 최우선 · 리스트상 입고 27.02, 미정 5종은 제조사도 없음. 27.01 동시 런칭 불가 · ⟦런칭시드⟧','김려은'),
  ('[제품] 바나나팩토리 CGMP / ISO 22716 보유 및 책임판매업 지원 범위 확 인','na','높음',date '2026-08-22','담당 BM·고문 · 우선순위 최우선 · 8종 단일 제조사 의존. 인증 미보유 시 대체처 필요 · ⟦런칭시드⟧','김려은'),
  ('[제품] 바나나팩토리 OEM 계약 체결','na','높음',date '2026-08-31','담당 BM·경영지원·대표이사 · 우선순위 최우선 · 선행: 제조사 미팅 · IP 귀속 조항 반드시 확인 · ⟦런칭시드⟧','김려은'),
  ('[제품] 1차 8종 처방 확정 (진정광크림 샘플 3종 테스트 포함)','na','높음',date '2026-09-15','담당 BM·대표이사 · 우선순위 최우선 · 선행: OEM 계약 · 처방 확정이 전체 일정의 기점. 밀리면 27.02 입고 불가 · ⟦런칭시드⟧','김려은'),
  ('[제품] 미정 5종 제조사 선정 — 앰플세럼, 크림, 선크림(CIT), 앰플미스트, 마스크팩','na','높음',date '2026-09-30','담당 BM·대표이사 · 26.08.12 착수 표기만 있고 제조사·입고일 공란 · ⟦런칭시드⟧','김려은'),
  ('[제품] 1차 8종 발주 확정','na','높음',date '2026-10-15','담당 MD·BM·대표이사 · 선행: 처방 확정, 가격 정책 · 리스트상 발주 확정 13종 전부 미체크 · ⟦런칭시드⟧',''),
  ('[서류] 1차 8종 안정성시험 착수 (가속·장기)','na','높음',date '2026-09-20','담당 BM · 우선순위 최우선 · 선행: 처방 확정 · 가속만 3개월. 9월 착수해야 12월 결과 · ⟦런칭시드⟧','김려은'),
  ('[서류] 제조사 CGMP / ISO 22716 인증서 확보','na','높음',date '2026-09-30','담당 BM · 선행: OEM 계약 · ⟦런칭시드⟧','김려은'),
  ('[서류] 전성분(INCI), 제품표준서, MSDS, CoA 취합','na','높음',date '2026-10-31','담당 BM · 선행: 처방 확정 · ⟦런칭시드⟧','김려은'),
  ('[서류] 동물실험 미실시 확인서 확보','na','높음',date '2026-10-31','담당 BM · EU·중국 수출 시 필수 · ⟦런칭시드⟧','김려은'),
  ('[서류] 알레르기 유발성분 목록 확정 및 표시 반영','na','높음',date '2026-11-15','담당 BM·디자이너·고문 · 선행: 전성분 확정 · ⟦런칭시드⟧','김려은'),
  ('[서류] 1차 8종 미생물·중금속 시험(CT) 의뢰 및 성적서 수령','na','높음',date '2026-11-30','담당 BM · 선행: 시제품 생산 · 리스트상 CT 요청·완료 13종 전부 미체크 · ⟦런칭시드⟧','김려은'),
  ('[서류] 자유판매증명서(CFS) 신청','na','보통',date '2027-01-15','담당 BM·경영지원 · 선행: 책임판매업 등록 · 수출 필수 서류 · ⟦런칭시드⟧','김려은'),
  ('[광고심의] 기획 소구 문구 실증 검토 — 4세대 / 모낭속 균 / 바를수록 미백','na','높음',date '2026-08-25','담당 마케터·BM·고문 · 우선순위 최우선 · 근거 없는 최상급·항균 효능·기능성 초과 표현. 기 획 단계에서 걸러야 함 · ⟦런칭시드⟧','차민준'),
  ('[리스크] 개발 리스트의 타겟 제품명 표기 정리 (내부 코드로 치환)','na','높음',date '2026-08-22','담당 BM·마케터·대표이사 · 경쟁사 제품명이 시트에 그대로 기재됨. 외부 공유 시 카피 프레임·부정경쟁 이슈 · ⟦런칭시드⟧','김려은'),
  ('[광고심의] 표시광고 실증자료 확보·보관 체계 수립','na','높음',date '2026-12-01','담당 마케터·BM·고문 · 화장품은 사전심의 없으나 실증자료 보관 의무 · ⟦런칭시드⟧','차민준'),
  ('[브랜드] BI 최종본 확정 (상표 출원용 도형 포함)','na','높음',date '2026-09-05','담당 디자이너·마케터·대표이사 · 우선순위 최우선 · 선행: 표기 확정 · 상표 출원과 패키지 인쇄의 선행조건 · ⟦런칭시드⟧','한여정'),
  ('[브랜드] 도메인·SNS 핸들 선점 — 전 채널','na','높음',date '2026-08-25','담당 마케터 · 우선순위 최우선 · 선행: 표기 확정 · 콜론 없는 표기로 확보 · ⟦런칭시드⟧','차민준'),
  ('[콘텐츠] 1차 8종 패키지 디자인·아트웍 (바코드·표시사항 반영)','na','높음',date '2026-12-15','담당 디자이너·BM·대표이사 · 선행: GS1 바코드, 전성분 확정 · ⟦런칭시드⟧','한여정'),
  ('[콘텐츠] 1차 8종 제품 촬영 및 상세페이지 제작','na','높음',date '2027-01-31','담당 디자이너·마케터 · 선행: 패키지 실물 · ⟦런칭시드⟧','한여정'),
  ('[콘텐츠] SNS 계정 개설 및 초기 피드','na','보통',date '2027-01-31','담당 마케터·디자이너 · 선행: 핸들 선점 · ⟦런칭시드⟧','차민준'),
  ('[홍보] 언론보도 배포처 리스트·견적','na','보통',date '2027-02-15','담당 마케터·대표이사 · ⟦런칭시드⟧','차민준'),
  ('[홍보] 런칭 보도자료 작성 및 배포','na','보통',date '2027-03-02','담당 마케터·대표이사 · 선행: 런칭일 확정 · 대외 발송이므로 대표 승인 후 배포 · ⟦런칭시드⟧','차민준'),
  ('[유통인프라] GS1 회원가입 및 표준바코드(GTIN) 발급','na','높음',date '2026-09-30','담당 BM·디자이너 · 패키지 인쇄의 선행조건 · ⟦런칭시드⟧','김려은'),
  ('[유통인프라] SKU 코드 체계 확정','na','높음',date '2026-09-30','담당 BM·MD · 선행: 런칭 차수 확정 · ⟦런칭시드⟧','김려은'),
  ('[유통인프라] 완제품 입고 전 3PL 업체 세팅 완료','na','높음',date '2027-01-15','담당 경영지원·MD · 우선순위 최우선 · 선행: 3PL 계약 · 개발 리스트 상단 명시 사항. 입고 전 완료 필수 · ⟦런칭시드⟧','박종혁'),
  ('[유통인프라] 생산물배상책임보험(PL) 가입','na','높음',date '2027-01-20','담당 경영지원 · 선행: 전성분, CT 성적서 · ⟦런칭시드⟧','박종혁'),
  ('[유통인프라] 반품·CS·교환 규정 문서화','na','높음',date '2027-01-31','담당 BM·경영지원·대표이사 · ⟦런칭시드⟧','김려은'),
  ('[가격정책] 채널별 마진 역산표 작성 (자사몰/올영/쿠팡/공구/오프라인)','na','높음',date '2026-09-30','담당 MD·경영지원 · 선행: 런칭 차수 확정 · ⟦런칭시드⟧',''),
  ('[가격정책] 1차 8종 채널별 가격 정책 확정안 상신','na','높음',date '2026-10-10','담당 MD·경영지원·대표이사 · 선행: 마진 역산표 · 발주 확정의 선행조건 · ⟦런칭시드⟧',''),
  ('[유통] 올리브영 입점 제안서 작성 및 상신','na','높음',date '2026-12-01','담당 MD·BM·대표이사 · 선행: 처방 확정 · 대외 제출이므로 대표 승인 후 발송 · ⟦런칭시드⟧',''),
  ('[유통] 자사몰 구축','na','높음',date '2027-02-10','담당 MD·디자이너 · 선행: 통신판매업 신고 · ⟦런칭시드⟧',''),
  ('[유통] 온라인 채널 입점 등록 (스마트스토어·쿠팡·무신사 등)','na','높음',date '2027-02-20','담당 MD · 선행: 통신판매업 신고 · ⟦런칭시드⟧',''),
  ('[IP] 상표 선등록 검색 — 회사명 + 제품명 (국내·중국)','na','높음',date '2026-08-25','담당 경영지원·BM·고문 · 우선순위 최우선 · 선행: 변리사 선임, 표기 확정 · 중국 브로커 선점 여부 확인 포함 · ⟦런칭시드⟧','박종혁'),
  ('[IP] 국내 상표 출원 (우선심사 청구)','na','높음',date '2026-09-10','담당 경영지원·고문 · 우선순위 최우선 · 선행: 상표 검색, BI 확정 · 3류·5류·35류 지정 · ⟦런칭시드⟧','박종혁'),
  ('[IP] 중국 상표 직접출원','na','높음',date '2026-09-30','담당 경영지원·고문 · 선행: 상표 검색 · 마드리드 아닌 직접출원 권장 · ⟦런칭시드⟧','박종혁'),
  ('[IP] 저작권 등록 (BI·대표 이미지)','na','보통',date '2026-10-15','담당 디자이너·경영지원 · 선행: BI 확정 · ⟦런칭시드⟧','한여정'),
  ('[IP] 디자인권 출원 (용기·패키지 형태)','na','높음',date '2026-12-20','담당 디자이너·경영지원·고문 · 선행: 패키지 아트웍 확정 · 공개 전 출원. 공개 후에는 신규성 상실 · ⟦런칭시드⟧','한여정'),
  ('[IP] 미국·일본·동남아 상표 출원 (파리조약 우선권 6개월 내)','na','보통',date '2027-03-10','담당 경영지원·고문 · 선행: 국내 출원 · ⟦런칭시드⟧','박종혁'),
  ('[IP] 아마존 Brand Registry 등록','na','보통',null,'담당 MD · 선행: 미국 상표 등록증 · ⟦런칭시드⟧',''),
  ('[정부지원] 벤처기업확인 신청','na','보통',date '2027-03-31','담당 경영지원·고문 · 선행: 기업부설연구소 · 연구개발유형 기준 · ⟦런칭시드⟧','박종혁'),
  ('[수출] 타겟국 바이어·유통 발굴 — 미국·중국·일본·동남아','na','높음',null,'담당 MD·BM·대표이사 · 인증보다 바이어가 먼저 · ⟦런칭시드⟧',''),
  ('[수출] 미국 MoCRA 대응 — US Agent 선임, 제품 리스팅','na','보통',null,'담당 BM·경영지원·고문 · 선행: 미국 바이어 확보 · 시설등록은 OEM사 의무, 제품 리스팅은 당사(RP) 의무 · ⟦런칭시드⟧','김려은'),
  ('[수출] 중국 진출 방식 결정안 상신 — NMPA 비안 / 크로스보더(CBEC)','na','보통',null,'담당 MD·BM·대표이사 · 선행: 중국 바이어 확보 · ⟦런칭시드⟧',''),
  ('[수출] 일본 화장품 제조판매업 파트너 발굴','na','보통',null,'담당 MD·BM·고문 · 선행: 일본 바이어 확보 · 현지 허가 보유 파트너 없이는 수입 불가 · ⟦런칭시드⟧',''),
  ('[수출] 동남아 인허가 대응 — 인니 BPOM·할랄, 베트남 공표, 태국 FDA','na','보통',null,'담당 BM·MD·고문 · 선행: 동남아 바이어 확보 · 인니 화장품 할랄 의무화 2026-10-17 시행 확정 · ⟦런칭시드⟧','김려은')
) as v(title, slug, priority, due, note, assignee)
left join public.brands b on nullif(v.slug,'') = b.slug
left join public.users u on nullif(v.assignee,'') = u.name;

-- ▼▼▼ migrations/0081_marketing_board.sql ▼▼▼
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



-- ============================================================================
-- 0082 — 런칭준비: 런칭 체크리스트 + 상세페이지 수정안
-- ============================================================================

-- 1) 런칭 체크리스트 ---------------------------------------------------------
create table if not exists public.launch_checklist (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid references public.brands(id) on delete set null,
  scope       text not null default '전사',        -- 전사 / 하루바른 / 나아
  seq         int  not null default 0,             -- 원본 No
  category    text not null,                        -- 카테고리
  item        text not null,                        -- 항목
  owner_role  text,                                 -- 담당(실행)
  collab      text,                                 -- 협업
  reviewer    text,                                 -- 검수
  priority    text not null default '일반' check (priority in ('최우선','높음','일반')),
  prereq      text,                                 -- 선행조건
  due_date    date,
  status      text not null default '미착수' check (status in ('미착수','진행','완료','지연','보류')),
  note        text,
  sort_order  int  not null default 0,
  seed_tag    text,
  updated_at  timestamptz not null default now()
);
create index if not exists launch_checklist_brand_idx on public.launch_checklist(brand_id);
alter table public.launch_checklist enable row level security;
drop policy if exists launch_checklist_all on public.launch_checklist;
create policy launch_checklist_all on public.launch_checklist for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

delete from public.launch_checklist where seed_tag = '⟦런칭체크시드⟧';
insert into public.launch_checklist
  (brand_id, scope, seq, category, item, owner_role, collab, reviewer, priority, prereq, due_date, status, note, sort_order, seed_tag)
select b.id, v.scope, v.seq, v.category, v.item, v.owner_role, v.collab, v.reviewer, v.priority, v.prereq, v.due::date, '미착수', v.note, v.so, '⟦런칭체크시드⟧'
from (values
  ('', '전사', 1, '자금', '법인 간 자금이동 원칙 수립 및 금전소비대차계약 서식 마련', '경영지원', null, '대표이사', '높음', null, '2026-09-05', '무계약 이체는 가지급금·인정이자 과세. VC 실사지적사항. 양 법인 공통 — 한 번만 수행', 1),
  ('', '전사', 2, 'IP', '변리사 선임 (상표·특허·디자인 일괄)', '경영지원', null, '대표이사', '최우선', null, '2026-08-18', '수임료 확정은 대표 승인 사항. 양 법인 공통 — 한번만 수행', 2),
  ('', '전사', 3, '유통인프라', '3PL 물류업체 선정 및 계약', '경영지원', 'MD', '대표이사', '최우선', null, '2026-08-22', '건기식 로트 추적 + 화장품 유통기한 관리 동시 가능 업체. 양 법인 공통', 3),
  ('', '전사', 4, '제조', '제조사 미팅 준비 및 진행 (쿠션·건기식·화장품)', 'BM', 'MD', '고문', '최우선', null, '2026-08-22', '소개는 고문·대표. 자료 준비와 진행은 BM. 양 법인 공통', 4),
  ('', '전사', 5, '정부지원', '기업부설연구소 설립 신고 (KOITA)', '경영지원', 'BM', '고문', '높음', '연구전담요원 확보', '2026-10-31', '벤처확인·세액공제·팁스의 공통 선행조건. 법인별각각 필요', 5),
  ('', '전사', 6, '정부지원', '정부지원 로드맵 수립 — 연구소 → 벤처확인 → 기보 → 팁스 순서', '경영지원', 'BM', '고문', '일반', null, '2026-09-15', '팁스는 운영사 추천이 병목. 인증보다 운영사 컨택이 선행. 양 법인 공통', 6),
  ('', '전사', 7, '리스크', '톤업 이너뷰티 세트 — 두 법인 간 거래·정산 구조 확정', '경영지원', 'BM', '대표이사', '높음', null, '2026-09-30', '화장품(나아) + 건기식(하루바른) 결합 상품. 판매주체 법인과 매입 방식 결정', 7),
  ('hb', '하루바른', 8, '판매자격', '통신판매업 신고 (관할 구청)', '경영지원', null, null, '최우선', '사업자등록증, 구매안전서비스 이용확인증', '2026-08-20', '에스크로 확인증이 선행. 은행 인터넷뱅킹에서 발급', 8),
  ('hb', '하루바른', 9, '자금', '사업자 통장 5분할 개설 — 매출수취 / 운영지출 / 매입결제 / 세금유보 / 조달자금', '경영지원', null, '대표이사', '최우선', '법인 통장 개설', '2026-08-21', '은행은 주거래 1곳으로 집중', 9),
  ('hb', '하루바른', 10, '자금', '신설법인 한도제한계좌 해제 신청', '경영지원', null, null, '최우선', '통장 개설', '2026-08-25', '해제 전에는 이체한도가 낮아 실무 불가. 계약서·매출증빙 지참', 10),
  ('hb', '하루바른', 11, '자금', '세금유보 이체 룰 세팅 — 매출수취 통장에서 월 매출의 20% 자동이체', '경영지원', null, '대표이사', '높음', '통장 5분할', '2026-08-28', '부가세·법인세·원천세·퇴직충당 재원', 11),
  ('hb', '하루바른', 12, '자금', '법인카드 발급 및 운영지출 통장 연결', '경영지원', null, null, '높음', '통장 5분할', '2026-08-28', null, 12),
  ('hb', '하루바른', 13, '자금', '4대보험 성립신고', '경영지원', null, null, '높음', null, '2026-08-31', null, 13),
  ('hb', '하루바른', 14, '판매자격', '4종 품목제조보고 유형 확인 — 건강기능식품 / 일반식품(기타가공품) [한솔 회신]', 'BM', null, '고문', '최우선', '제조사 회신', '2026-08-16', '생산리스트상 기능성 신고 4종 전부 미체크. 일반식품 유력. 전체 규제 근거의 기점', 14),
  ('hb', '하루바른', 15, '판매자격', '리셀바인(NMN) 식품원료 사용 적법성 확인 — 식품공전 등재 / 한시적 인정 여부', 'BM', null, '고문', '최우선', '제조사 회신', '2026-08-17', 'NMN은 건기식 원료 미인정. 한시적 인정이면 신청자에게만 효력이라 사용 불가할 수 있음', 15),
  ('hb', '하루바른', 16, '판매자격', '영업자 위생교육 이수 (온라인)', '경영지원', null, null, '최우선', null, '2026-08-17', '판매업 신고의 선행조건', 16),
  ('hb', '하루바른', 17, '판매자격', '건강기능식품 일반판매업 신고 (관할 시군구)', '경영지원', null, null, '최우선', '위생교육 이수, 품목 유형 확정', '2026-08-19', '4종 전부 일반식품이면 해당없음. 향후 건기식 취급 대비해 선제 신고 권장', 17),
  ('hb', '하루바른', 18, '판매자격', '품목제조보고 완료 확인 및 보고서 사본 수령', 'BM', null, null, '최우선', null, '2026-08-18', '제조사가 안 했으면 출고 자체가 불법', 18),
  ('hb', '하루바른', 19, '판매자격', '제품 표시사항(라벨) 최종 검토 — 인쇄 전', 'BM', '디자이너', '고문', '최우선', '전성분 발행, 품목제조보고', '2026-08-18', '전성분 미발행 상태의 문안 검수는 최종본이 아님.재인쇄 위험', 19),
  ('hb', '하루바른', 20, '판매자격', '보부상 건기 공장 완공(27.01)과 남성활력 입고(26.10말) 일정 정합성 확인', 'BM', null, null, '높음', '제조사 회신', '2026-08-22', '공장 완공 전 생산 불가. 일정 모순 해소 필요', 20),
  ('hb', '하루바른', 21, '서류', '전성분 발행 요청 및 수령 — 4종', 'BM', null, null, '최우선', null, '2026-08-18', '생산리스트 미체크. 표시사항·상세페이지·PL보험·입점서류 전부의 선행조건', 21),
  ('hb', '하루바른', 22, '서류', '자가품질검사(CT) 의뢰 및 성적서 수령 — 4종', 'BM', null, null, '최우선', null, '2026-08-20', '생산리스트상 CT 요청·완료 모두 미체크', 22),
  ('hb', '하루바른', 23, '서류', '제조사 서류 취합 ① 원료 근거 (고시형 / 개별인정형 / 일반원료), 배합비', 'BM', null, '고문', '최우선', null, '2026-08-18', '개별인정형이면 사용 권한이 원료사에게만 있는지확인', 23),
  ('hb', '하루바른', 24, '서류', '제조사 서류 취합 ② 유통기한 설정사유서, 영양성분 분석표', 'BM', null, null, '최우선', null, '2026-08-18', null, 24),
  ('hb', '하루바른', 25, '서류', '제조사 서류 취합 ③ GMP 또는 HACCP 인증서 사본', 'BM', null, null, '최우선', null, '2026-08-18', '건기식이면 GMP 의무. 일반식품이면 HACCP', 25),
  ('hb', '하루바른', 26, '서류', '인체적용시험 의뢰 여부 결정 — 4종 중 우선순위 선별', 'BM', '마케터', '대표이사', '높음', '품목 유형 확정', '2026-08-31', '일반식품은 임상 없이는 효능 소구 근거가 전무. 개별인정형·조성물특허의 기초자료', 26),
  ('hb', '하루바른', 27, '광고심의', '4종 소구 재설계 — 탈모·다이어트·항노화·항산화 표현 대체안 확정', '마케터', 'BM', '고문', '최우선', '품목 유형 확정', '2026-08-18', '일반식품은 해당 표현 전부 사용 불가. 제품명은 문제없으나 카테고리·상세페이지가 위반', 27),
  ('hb', '하루바른', 28, '런칭전략', '런칭 시나리오 확정·상신 (품목 유형 반영)', 'BM', null, null, '일반', '마케터, MD대표이사최우선품목 유형 확정', '2026-08-18', '일반식품 단일 트랙 / 건기식 분리 2단계 중 결정', 28),
  ('hb', '하루바른', 29, '광고심의', '상세페이지·SNS 문구안 작성 (대체 소구 기준)', '마케터', 'BM', '고문', '최우선', '소구 재설계', '2026-08-20', null, 29),
  ('hb', '하루바른', 30, '광고심의', '건기식 표시광고 사전심의 신청 (한국건강기능식품협회)', '마케터', 'BM', '고문', '높음', '건기식 품목 확정 시에만 해당', '2026-08-20', '일반식품이면 해당없음. 건기식 품목이 있으면 통상 15일 내외로 8/27 불가', 30),
  ('hb', '하루바른', 31, '브랜드', 'BI 최종본 확정 (상표 출원용 도형 포함)', '디자이너', '마케터', '대표이사', '최우선', null, '2026-08-18', '상표 출원과 패키지 인쇄의 선행조건', 31),
  ('hb', '하루바른', 32, '브랜드', '도메인·SNS 핸들 선점 — 전 채널', '마케터', null, null, '최우선', '브랜드명 확정', '2026-08-17', '상표 출원과 동시에. 순서가 벌어지면 선점당함', 32),
  ('hb', '하루바른', 33, '콘텐츠', '패키지 아트웍 최종 (바코드·표시사항 반영) 및 인쇄 발주', '디자이너', 'BM', '대표이사', '최우선', 'GS1 바코드, 표시사항 확정', '2026-08-18', '인쇄 발주 금액은 대표 승인 후', 33),
  ('hb', '하루바른', 34, '콘텐츠', '제품 촬영 (제품컷·연출컷·누끼)', '디자이너', '마케터', null, '높음', '패키지 실물 입고', '2026-08-20', null, 34),
  ('hb', '하루바른', 35, '콘텐츠', '상세페이지 디자인 (승인 문구 기준)', '디자이너', '마케터', '고문', '높음', '문구안 확정', '2026-08-22', null, 35),
  ('hb', '하루바른', 36, '콘텐츠', 'SNS 계정 개설 및 초기 피드 12컷', '마케터', '디자이너', null, '일반', null, '2026-08-25', null, 36),
  ('hb', '하루바른', 37, '홍보', '언론보도 배포처 10곳 리스트·견적', '마케터', null, '대표이사', '일반', null, '2026-08-24', '전재 매체 비중 확인. 검색 인덱싱 목적임을 전제', 37),
  ('hb', '하루바른', 38, '홍보', '런칭 보도자료 작성 및 배포', '마케터', null, '대표이사', '일반', '런칭 시나리오 확정', '2026-08-27', '대외 발송이므로 대표 승인 후 배포', 38),
  ('hb', '하루바른', 39, '홍보', '브랜드 검색 1페이지 장악 설계 (네이버·구글·인스타)', '마케터', '디자이너', null, '일반', null, '2026-09-10', null, 39),
  ('hb', '하루바른', 40, '유통인프라', 'GS1 회원가입 및 표준바코드(GTIN) 발급', 'BM', '디자이너', null, '최우선', null, '2026-08-18', '패키지 인쇄의 선행조건. 지연 시 런칭 전체가 밀림', 40),
  ('hb', '하루바른', 41, '유통인프라', 'SKU 코드 체계 확정', 'BM', 'MD', null, '높음', null, '2026-08-18', null, 41),
  ('hb', '하루바른', 42, '유통인프라', '생산물배상책임보험(PL) 가입', '경영지원', null, null, '최우선', '전성분, CT 성적서', '2026-08-25', '올리브영·쿠팡·대형마트 입점 요구 서류', 42),
  ('hb', '하루바른', 43, '유통인프라', '반품·CS·교환 규정 문서화', 'BM', '경영지원', '대표이사', '높음', null, '2026-08-24', null, 43),
  ('hb', '하루바른', 44, '가격정책', '채널별 마진 역산표 작성 (자사몰/스마트스토어/쿠팡/공구/오프라인)', 'MD', '경영지원', null, '최우선', null, '2026-08-20', '소비자가 역산. 런칭 후에는 못 고침', 44),
  ('hb', '하루바른', 45, '가격정책', '최저가 방어(MAP) 정책 수립', 'MD', null, '대표이사', '높음', '마진 역산표', '2026-08-22', null, 45),
  ('hb', '하루바른', 46, '가격정책', '4종 채널별 판매가 확정안 상신', 'MD', '경영지원', '대표이사', '최우선', '마진 역산표', '2026-08-20', '금액 최종 확정은 대표 승인 사항', 46),
  ('hb', '하루바른', 47, '유통', '초도 발주 수량 확정 및 발주서 상신', 'MD', 'BM', '대표이사', '최우선', '판매가 승인', '2026-08-18', '4종 SKU별 수량. 발주서 발송은 대표 승인 후', 47),
  ('hb', '하루바른', 48, '유통', '스마트스토어·쿠팡 입점 등록', 'MD', null, null, '높음', '통신판매업 신고, 품목 유형확정', '2026-08-22', '건기식 카테고리는 신고증 첨부 필수', 48),
  ('hb', '하루바른', 49, '유통', '자사몰 오픈 (결제·배송·CS 세팅 포함)', 'MD', '디자이너', null, '최우선', '통신판매업 신고', '2026-08-25', null, 49),
  ('hb', '하루바른', 50, 'IP', '상표 선등록 검색 — 회사명 + 4종 제품명 (국내·중국)', '경영지원', 'BM', '고문', '최우선', '변리사 선임', '2026-08-18', '서리블랙·바비컷·레몽드올리·리셀바인. 중국 브로커 선점 여부 포함', 50),
  ('hb', '하루바른', 51, 'IP', '국내 상표 출원 (우선심사 청구)', '경영지원', null, '고문', '최우선', '상표 검색, BI 확정', '2026-08-25', '5류·29·30·32류·35류 확장 지정', 51),
  ('hb', '하루바른', 52, 'IP', '디자인권 출원 (용기·패키지 형태)', '디자이너', '경영지원', '고문', '높음', '패키지 아트웍 확정', '2026-08-25', '공개 전 출원. 공개 후에는 신규성 상실', 52),
  ('hb', '하루바른', 53, 'IP', '중국 상표 직접출원', '경영지원', null, '고문', '높음', '상표 검색', '2026-09-10', '마드리드 아닌 직접출원 권장', 53),
  ('hb', '하루바른', 54, 'IP', '조성물특허 — 한솔 턴키 계약상 처방 권리 귀속 확인', 'BM', '경영지원', '고문', '최우선', '계약서 확보', '2026-09-01', '공동출원이면 기보 기술평가·팁스 활용 불가', 54),
  ('hb', '하루바른', 55, 'IP', '저작권 등록 (BI·대표 이미지)', '디자이너', '경영지원', null, '일반', 'BI 확정', '2026-09-15', null, 55),
  ('hb', '하루바른', 56, 'IP', '조성물특허 출원 (우선심사 청구)', 'BM', '경영지원', '고문', '높음', '권리 귀속 확인, 인체적용시험', '2026-10-31', '정부지원 가점은 등록 기준. 출원만으로는 부족', 56),
  ('hb', '하루바른', 57, 'IP', '미국·일본·동남아 상표 출원 (파리조약 우선권 6개월 내)', '경영지원', null, '고문', '일반', '국내 출원', '2026-12-31', null, 57),
  ('hb', '하루바른', 58, 'IP', '아마존 Brand Registry 등록', 'MD', null, null, '일반', '미국 상표 등록증미착수', null, null, 58),
  ('hb', '하루바른', 59, '정부지원', '벤처기업확인 신청', '경영지원', null, '고문', '일반', '기업부설연구소', '2026-12-31', '연구개발유형 기준', 59),
  ('hb', '하루바른', 60, '수출', '타겟국 바이어·유통 발굴 — 미국·중국·일본·동남아', 'MD', 'BM', '대표이사', '높음', '미착수인증보다 바이어가 먼저. 순서를 뒤집으면 비용만묶임', null, null, 60),
  ('hb', '하루바른', 61, '수출', '미국 FDA 식품시설 등록 + US Agent 선임', 'BM', '경영지원', '고문', '일반', '미국 바이어 확보미착수', null, null, 61),
  ('hb', '하루바른', 62, '수출', '중국 진출 방식 결정안 상신 — 일반무역 / 크로스보더(CBEC)', 'MD', 'BM', '대표이사', '일반', '중국 바이어 확보미착수', null, null, 62),
  ('hb', '하루바른', 63, '수출', '동남아 인허가 대응 — 베트남 공표, 태국 FDA, 인니 BPOM·할랄', 'BM', 'MD', '고문', '일반', '동남아 바이어 확보미착수하루바른 런칭 크리티컬 패스 (목표 2026-08-27, 4종)아래 순서가 하루라도 밀리면 8/27 런칭이 불가능하다. 검수 열이 비어 있으면 실행자 판단으로 종결한다.일자항목담당(실행)검수산출물이게 밀리면08-164종 품목제조보고 유형 확인 (한솔 회신)BM고문품목별 유형 확인서소구·표시사항·판매채널 전부 결정 불가08-17리셀바인(NMN) 식품원료 적법성 확인BM고문원료 적법성 회신해당 품목 판매 자체가 불가할 수 있음08-17영업자 위생교육 이수경영지원이수증판매업 신고 불가08-17도메인·SNS 핸들 선점마케터계정 개설 완료브랜드명 선점당함08-18전성분 발행 수령 — 4종BM전성분표표시사항·상세페이지·PL보험·입점서류 전부 정지08-184종 소구 재설계 — 대체 표현 확정마케터고문소구 문구 세트상세페이지 전면 재작업 또는 표시광고법 위반08-18제품 표시사항(라벨) 최종 검토BM고문라벨 승인본패키지 재인쇄08-18GS1 표준바코드(GTIN) 발급BMGTIN 목록패키지 인쇄·유통 입점 전부 중단08-18제조사 서류 3종 취합 완료BM고문서류 파일 세트입점 심사·PL보험 가입 불가08-18품목제조보고 완료 확인BM보고서 사본제품 출고 자체가 불법08-18패키지 아트웍 최종 → 인쇄 발주디자이너대표이사인쇄 입고 일정8/27 실물 없음08-18초도 발주 수량 확정 및 발주서 상신MD대표이사발주서 승인본제조 리드타임상 8/27 입고 불가08-18런칭 시나리오 확정·상신BM대표이사런칭 시나리오 확정본8/27 실행 기준 부재08-18변리사 선임 및 상표 선등록 검색경영지원고문검색 결과 보고브랜드명 확정 불가08-19건강기능식품 일반판매업 신고경영지원신고증건기식 카테고리 채널 등록 불가08-20통신판매업 신고경영지원신고증온라인 판매 불가08-20자가품질검사(CT) 성적서 수령 — 4종BM시험성적서입점 심사·PL보험 가입 불가08-20채널별 판매가 확정안 상신MD대표이사가격표 승인본채널 등록·상세페이지 확정 불가08-20제품 촬영디자이너제품컷·연출컷상세페이지 제작 불가08-21통장 5분할 개설 + 한도제한 해제 신청경영지원대표이사계좌 목록PG 정산 수취 계좌 미확정08-223PL 물류 계약경영지원대표이사계약서출고 불가08-22스마트스토어·쿠팡 입점 등록MD입점 승인판매 채널 없음08-22상세페이지 디자인디자이너고문상세페이지판매 페이지 없음08-25PL보험 가입경영지원증권대형 채널 입점 서류 미비08-25자사몰 오픈MD오픈 완료직접 판매 채널 없음08-27런칭 · 보도자료 배포마케터대표이사보도 게재-기준정보 · 역할 정의고문과 대표이사는 실행 항목을 갖지 않는다. 검수 열에만 등장한다.역할구분담당 범위이 사람이 막히면 멈추는 것대표이사검수되돌릴 수 없는 것만 본다 — 금액 확정(발주·수임료·계약금), 대외 발송(제안서·보도자료), 계약 체결, 채용, 런칭 시나리오발주, 가격 확정, 계약 체결, 대외 발송고문검수전문성 판단이 필요한 것만 본다 — 제품 분류, 표시사항, 소구 문구, IP 출원 전략, 인허가·수출국 요건제품 분류, 상표·특허 출원, 인허가BM실행브랜드 총괄. 제품 스펙, 제조사 커뮤니케이션, 규제 서류 취합, 바코드·SKU, 인허가 실무, 런칭 일정 관리서류 패키지 전부, 바코드, 표시사항, 제조사마케터실행콘텐츠 기획, 광고 집행, 소구 설계, 표시광고 실무, 언론보도, SNS, 시딩상세페이지, 소구 문구, 런칭 홍보디자이너실행BI, 패키지 아트웍, 상세페이지, 제품 촬영, 디자인권 출원 도면패키지 인쇄, 상세페이지, 상표 도형MD실행유통 입점, 채널 가격·마진 설계, 발주·재고, 해외 바이어 발굴, 자사몰판매 채널, 초도 발주, 가격표경영지원실행법인 등록·신고, 통장·자금, 세무, 보험, 물류 계약, IP 출원 행정, 계약서 관리, 인사판매 자격 전부, 자금 흐름, 상표 출원검수 원칙검수 대상은 되돌릴 수 없는 항목에만 건다. 되돌릴 수 있는 일까지 검수를 걸면 병목이 대표·고문에게 몰린다.대표이사 검수 = 금액 확정 · 대외 발송 · 계약 체결 · 채용 · 런칭 시나리오고문 검수 = 제품 분류 · 표시사항 · 소구 문구 · IP 출원 전략 · 인허가 요건검수 열이 빈 항목은 실행자 판단으로 종결한다. 별도 보고하지 않는다.검수 절차: 실행자가 상태를 ''완료''로 바꾸고 검수완료를 ''대기''로 둔다. 검수자가 ''승인'' 또는 ''반려''로 바꾼다.반려 시 상태를 ''진행''으로 되돌리고 대기대상에 검수자를 적는다.적용범위가 ''전사''인 항목은 두 법인 공통이다. 한쪽에서 완료하면 다른 파일에서도 완료로 표시한다.상태값 / 검수값상태: 미착수 / 진행 / 완료 / 지연 / 보류 / 해당없음검수완료: 대기 / 승인 / 반려우선순위: 최우선 / 높음 / 일반색상: 빨강 = 기한 초과 · 노랑 = D-3 이내 · 주황 = 기한 미정 최우선 · 회색 = 완료 · 파랑 = 검수 대상 · 초록 = 전사 공통확인 필요1. 4종 품목제조보고 유형 — 한솔 회신 대기. 생산리스트상 기능성 신고 미체크로 일반식품 유력2. 리셀바인(NMN) 식품원료 사용 적법성 — 건기식 원료 미인정. 일반식품 사용 가능 여부 확인 필요3. 4종 전성분 · CT 성적서 — 생산리스트 미체크. 08.27 입고 대비 최대 병목4. 이미 검수 완료된 문안에 탈모·다이어트·항노화 표현이 들어갔는지5. 목업이 인쇄 발주에 들어갔는지, 아직 시안 단계인지6. 보부상 건기 공장 완공(27.01)과 남성활력 입고(26.10말) 일정 모순7. 조성물특허 권리 귀속 — 한솔 턴키 계약서 확인 전8. 마케터 · MD 2개 역할 공석 (BM · 디자이너는 내부 보유)9. 각 항목의 예산 — 금액은 기재하지 않음. 대표 확정 후 반영하루바른 런칭 후 판매플랜 (런칭 2026-08-27, 4종)기존 런칭체크리스트와 컬럼 구조가 같다. 구글 시트에 새 탭으로 가져온 뒤 그대로 쓰면 된다.No적용범위카테고리항목담당(실행)협업검수우선순위선행조건완료목표일D-Day상태검수완료대기대상비고', null, null, 63),
  ('na', '나아', 8, '브랜드', '법인·브랜드 표기 확정 — NA:AH / 나아 / 더나아', 'BM', '마케터', '대표이사', '최우선', null, '2026-08-20', '콜론(:)은 도메인 사용 불가, 상표 표장에도 제약.표기 갈리면 상표·도메인·패키지가 전부 어긋남', 64),
  ('na', '나아', 9, '판매자격', '책임판매관리자 채용 공고 게시', '경영지원', null, '대표이사', '최우선', null, '2026-08-22', '내부 유자격자 없음 확인됨. 채용 리드타임 1~2개월. 나아의 실제 크리티컬 패스', 65),
  ('na', '나아', 10, '판매자격', '책임판매관리자 채용 확정 또는 외부 위탁 선임', '경영지원', null, '대표이사', '최우선', '채용 공고', '2026-09-30', '10월 중 미확정 시 27.03 런칭도 불가', 66),
  ('na', '나아', 11, '판매자격', '화장품책임판매업 등록 (지방식약청)', '경영지원', null, '고문', '최우선', '책임판매관리자 선임', '2026-10-15', null, 67),
  ('na', '나아', 12, '판매자격', '통신판매업 신고', '경영지원', null, null, '높음', null, '2026-10-20', null, 68),
  ('na', '나아', 13, '판매자격', '기능성화장품 2종 확정 — 톤업로션(미백), 캡슐자차 선크림(자외선차단)', 'BM', null, '고문', '최우선', '처방 확정', '2026-09-15', '리스트상 미백기능성·UV차단 명시. 심사 또는 보고 대상', 69),
  ('na', '나아', 14, '판매자격', '자외선차단지수(SPF/PA) 인체적용시험 의뢰', 'BM', null, '고문', '최우선', '선크림 처방 확정', '2026-10-15', '시험 4~8주. 13종 중 리드타임 최장. 선크림 출시일을 결정', 70),
  ('na', '나아', 15, '판매자격', '기능성화장품 심사 또는 보고 접수', 'BM', null, '고문', '높음', '인체적용시험 결과', '2026-12-15', '심사는 통상 60일. 보고 요건 충족 여부 먼저 확인', 71),
  ('na', '나아', 16, '자금', '사업자 통장 5분할 개설 — 매출수취 / 운영지출 / 매입결제 / 세금유보 / 조달자금', '경영지원', null, '대표이사', '높음', '법인 통장 개설', '2026-09-10', '은행은 주거래 1곳으로 집중', 72),
  ('na', '나아', 17, '자금', '신설법인 한도제한계좌 해제 신청', '경영지원', null, null, '높음', '통장 개설', '2026-09-20', null, 73),
  ('na', '나아', 18, '자금', '세금유보 이체 룰 세팅 — 매출수취 통장에서 월 매출의 20% 자동이체', '경영지원', null, '대표이사', '일반', '통장 5분할', '2026-09-30', null, 74),
  ('na', '나아', 19, '자금', '법인카드 발급 및 운영지출 통장 연결', '경영지원', null, null, '일반', '통장 5분할', '2026-09-30', null, 75),
  ('na', '나아', 20, '자금', '4대보험 성립신고', '경영지원', null, null, '일반', null, '2026-09-30', null, 76),
  ('na', '나아', 21, '제품', '런칭 차수·종수 확정 — 13종 동시 / 단계 분할 결정', 'BM', 'MD', '대표이사', '최우선', null, '2026-08-22', '리스트상 입고 27.02, 미정 5종은 제조사도 없음.27.01 동시 런칭 불가', 77),
  ('na', '나아', 22, '제품', '바나나팩토리 CGMP / ISO 22716 보유 및 책임판매업 지원 범위 확인', 'BM', null, '고문', '최우선', null, '2026-08-22', '8종 단일 제조사 의존. 인증 미보유 시 대체처 필요', 78),
  ('na', '나아', 23, '제품', '바나나팩토리 OEM 계약 체결', 'BM', '경영지원', '대표이사', '최우선', '제조사 미팅', '2026-08-31', 'IP 귀속 조항 반드시 확인', 79),
  ('na', '나아', 24, '제품', '1차 8종 처방 확정 (진정광크림 샘플 3종 테스트 포함)', 'BM', null, '대표이사', '최우선', 'OEM 계약', '2026-09-15', '처방 확정이 전체 일정의 기점. 밀리면 27.02 입고불가', 80),
  ('na', '나아', 25, '제품', '미정 5종 제조사 선정 — 앰플세럼, 크림, 선크림(CIT), 앰플미스트,마스크팩', 'BM', null, '대표이사', '높음', null, '2026-09-30', '26.08.12 착수 표기만 있고 제조사·입고일 공란', 81),
  ('na', '나아', 26, '제품', '1차 8종 발주 확정', 'MD', 'BM', '대표이사', '높음', '처방 확정, 가격 정책', '2026-10-15', '리스트상 발주 확정 13종 전부 미체크', 82),
  ('na', '나아', 27, '서류', '1차 8종 안정성시험 착수 (가속·장기)', 'BM', null, null, '최우선', '처방 확정', '2026-09-20', '가속만 3개월. 9월 착수해야 12월 결과', 83),
  ('na', '나아', 28, '서류', '제조사 CGMP / ISO 22716 인증서 확보', 'BM', null, null, '높음', 'OEM 계약', '2026-09-30', null, 84),
  ('na', '나아', 29, '서류', '전성분(INCI), 제품표준서, MSDS, CoA 취합', 'BM', null, null, '높음', '처방 확정', '2026-10-31', null, 85),
  ('na', '나아', 30, '서류', '동물실험 미실시 확인서 확보', 'BM', null, null, '높음', null, '2026-10-31', 'EU·중국 수출 시 필수', 86),
  ('na', '나아', 31, '서류', '알레르기 유발성분 목록 확정 및 표시 반영', 'BM', '디자이너', '고문', '높음', '전성분 확정', '2026-11-15', null, 87),
  ('na', '나아', 32, '서류', '1차 8종 미생물·중금속 시험(CT) 의뢰 및 성적서 수령', 'BM', null, null, '높음', '시제품 생산', '2026-11-30', '리스트상 CT 요청·완료 13종 전부 미체크', 88),
  ('na', '나아', 33, '서류', '자유판매증명서(CFS) 신청', 'BM', '경영지원', null, '일반', '책임판매업 등록', '2027-01-15', '수출 필수 서류', 89),
  ('na', '나아', 34, '광고심의', '기획 소구 문구 실증 검토 — 4세대 / 모낭속 균 / 바를수록 미백', '마케터', 'BM', '고문', '최우선', null, '2026-08-25', '근거 없는 최상급·항균 효능·기능성 초과 표현. 기획 단계에서 걸러야 함', 90),
  ('na', '나아', 35, '리스크', '개발 리스트의 타겟 제품명 표기 정리 (내부 코드로 치환)', 'BM', '마케터', '대표이사', '높음', null, '2026-08-22', '경쟁사 제품명이 시트에 그대로 기재됨. 외부 공유시 카피 프레임·부정경쟁 이슈', 91),
  ('na', '나아', 36, '광고심의', '표시광고 실증자료 확보·보관 체계 수립', '마케터', 'BM', '고문', '높음', null, '2026-12-01', '화장품은 사전심의 없으나 실증자료 보관 의무', 92),
  ('na', '나아', 37, '브랜드', 'BI 최종본 확정 (상표 출원용 도형 포함)', '디자이너', '마케터', '대표이사', '최우선', '표기 확정', '2026-09-05', '상표 출원과 패키지 인쇄의 선행조건', 93),
  ('na', '나아', 38, '브랜드', '도메인·SNS 핸들 선점 — 전 채널', '마케터', null, null, '최우선', '표기 확정', '2026-08-25', '콜론 없는 표기로 확보', 94),
  ('na', '나아', 39, '콘텐츠', '1차 8종 패키지 디자인·아트웍 (바코드·표시사항 반영)', '디자이너', 'BM', '대표이사', '높음', 'GS1 바코드, 전성분 확정', '2026-12-15', null, 95),
  ('na', '나아', 40, '콘텐츠', '1차 8종 제품 촬영 및 상세페이지 제작', '디자이너', '마케터', null, '높음', '패키지 실물', '2027-01-31', null, 96),
  ('na', '나아', 41, '콘텐츠', 'SNS 계정 개설 및 초기 피드', '마케터', '디자이너', null, '일반', '핸들 선점', '2027-01-31', null, 97),
  ('na', '나아', 42, '홍보', '언론보도 배포처 리스트·견적', '마케터', null, '대표이사', '일반', null, '2027-02-15', null, 98),
  ('na', '나아', 43, '홍보', '런칭 보도자료 작성 및 배포', '마케터', null, '대표이사', '일반', '런칭일 확정', '2027-03-02', '대외 발송이므로 대표 승인 후 배포', 99),
  ('na', '나아', 44, '유통인프라', 'GS1 회원가입 및 표준바코드(GTIN) 발급', 'BM', '디자이너', null, '높음', null, '2026-09-30', '패키지 인쇄의 선행조건', 100),
  ('na', '나아', 45, '유통인프라', 'SKU 코드 체계 확정', 'BM', 'MD', null, '높음', '런칭 차수 확정', '2026-09-30', null, 101),
  ('na', '나아', 46, '유통인프라', '완제품 입고 전 3PL 업체 세팅 완료', '경영지원', 'MD', null, '최우선', '3PL 계약', '2027-01-15', '개발 리스트 상단 명시 사항. 입고 전 완료 필수', 102),
  ('na', '나아', 47, '유통인프라', '생산물배상책임보험(PL) 가입', '경영지원', null, null, '높음', '전성분, CT 성적서', '2027-01-20', null, 103),
  ('na', '나아', 48, '유통인프라', '반품·CS·교환 규정 문서화', 'BM', '경영지원', '대표이사', '높음', null, '2027-01-31', null, 104),
  ('na', '나아', 49, '가격정책', '채널별 마진 역산표 작성 (자사몰/올영/쿠팡/공구/오프라인)', 'MD', '경영지원', null, '높음', '런칭 차수 확정', '2026-09-30', null, 105),
  ('na', '나아', 50, '가격정책', '1차 8종 채널별 가격 정책 확정안 상신', 'MD', '경영지원', '대표이사', '높음', '마진 역산표', '2026-10-10', '발주 확정의 선행조건', 106),
  ('na', '나아', 51, '유통', '올리브영 입점 제안서 작성 및 상신', 'MD', 'BM', '대표이사', '높음', '처방 확정', '2026-12-01', '대외 제출이므로 대표 승인 후 발송', 107),
  ('na', '나아', 52, '유통', '자사몰 구축', 'MD', '디자이너', null, '높음', '통신판매업 신고', '2027-02-10', null, 108),
  ('na', '나아', 53, '유통', '온라인 채널 입점 등록 (스마트스토어·쿠팡·무신사 등)', 'MD', null, null, '높음', '통신판매업 신고', '2027-02-20', null, 109),
  ('na', '나아', 54, 'IP', '상표 선등록 검색 — 회사명 + 제품명 (국내·중국)', '경영지원', 'BM', '고문', '최우선', '변리사 선임, 표기 확정', '2026-08-25', '중국 브로커 선점 여부 확인 포함', 110),
  ('na', '나아', 55, 'IP', '국내 상표 출원 (우선심사 청구)', '경영지원', null, '고문', '최우선', '상표 검색, BI 확정', '2026-09-10', '3류·5류·35류 지정', 111),
  ('na', '나아', 56, 'IP', '중국 상표 직접출원', '경영지원', null, '고문', '높음', '상표 검색', '2026-09-30', '마드리드 아닌 직접출원 권장', 112),
  ('na', '나아', 57, 'IP', '저작권 등록 (BI·대표 이미지)', '디자이너', '경영지원', null, '일반', 'BI 확정', '2026-10-15', null, 113),
  ('na', '나아', 58, 'IP', '디자인권 출원 (용기·패키지 형태)', '디자이너', '경영지원', '고문', '높음', '패키지 아트웍 확정', '2026-12-20', '공개 전 출원. 공개 후에는 신규성 상실', 114),
  ('na', '나아', 59, 'IP', '미국·일본·동남아 상표 출원 (파리조약 우선권 6개월 내)', '경영지원', null, '고문', '일반', '국내 출원', '2027-03-10', null, 115),
  ('na', '나아', 60, 'IP', '아마존 Brand Registry 등록', 'MD', null, null, '일반', '미국 상표 등록증미착수', null, null, 116),
  ('na', '나아', 61, '정부지원', '벤처기업확인 신청', '경영지원', null, '고문', '일반', '기업부설연구소', '2027-03-31', '연구개발유형 기준', 117),
  ('na', '나아', 62, '수출', '타겟국 바이어·유통 발굴 — 미국·중국·일본·동남아', 'MD', 'BM', '대표이사', '높음', '미착수인증보다 바이어가 먼저', null, null, 118),
  ('na', '나아', 63, '수출', '미국 MoCRA 대응 — US Agent 선임, 제품 리스팅', 'BM', '경영지원', '고문', '일반', '미국 바이어 확보미착수시설등록은 OEM사 의무, 제품 리스팅은 당사(RP)의무', null, null, 119),
  ('na', '나아', 64, '수출', '중국 진출 방식 결정안 상신 — NMPA 비안 / 크로스보더(CBEC)', 'MD', 'BM', '대표이사', '일반', '중국 바이어 확보미착수', null, null, 120),
  ('na', '나아', 65, '수출', '일본 화장품 제조판매업 파트너 발굴', 'MD', 'BM', '고문', '일반', '일본 바이어 확보미착수현지 허가 보유 파트너 없이는 수입 불가', null, null, 121),
  ('na', '나아', 66, '수출', '동남아 인허가 대응 — 인니 BPOM·할랄, 베트남 공표, 태국 FDA', 'BM', 'MD', '고문', '일반', '동남아 바이어 확보미착수인니 화장품 할랄 의무화 2026-10-17 시행 확정나아 런칭 크리티컬 패스 (목표 2027-03, 1차 8종)월 단위 마일스톤이다. 각 월의 항목이 끝나야 다음 달이 시작된다. 처방 확정(26.09)이 전체 일정의 기점.시점항목담당(실행)검수산출물이게 밀리면26.08표기 확정 · 런칭 차수 결정 · 제조사 검증 · OEM 계약 · 책임판매관리자 공고BM / 경영지원대표이사런칭 차수 확정본, OEM 계약서9월 처방 확정 불가 → 27.02 입고 붕괴26.091차 8종 처방 확정 · 안정성시험 착수 · 책임판매관리자 확정 ·기능성 2종 확정 · 국내 상표 출원BM / 경영지원대표이사 · 고문처방 확정서, 시험 의뢰서가속시험 3개월이 12월을 넘김 → 런칭 불가26.10SPF/PA 인체적용시험 의뢰 · 화장품책임판매업 등록 · 가격 정책 확정 · 1차 8종 발주BM / MD / 경영지원대표이사 · 고문등록증, 발주서 승인본생산 착수 불가26.11전성분·CT 등 서류 취합 · 알레르기 성분 확정 · 올리브영 제안준비BM / MD고문서류 패키지패키지 아트웍 확정 불가26.12기능성 심사·보고 접수 · 패키지 아트웍 확정 · 디자인권 출원 ·실증자료 체계BM / 디자이너대표이사 · 고문아트웍 승인본인쇄·생산 지연27.013PL 세팅 완료 · PL보험 · 제품 촬영 · 상세페이지 · CFS 신청경영지원 / 디자이너3PL 세팅 완료, 상세페이지완제품 입고를 받을 수 없음27.02완제품 입고 · 자사몰 구축 · 온라인 채널 입점 등록MD입점 승인판매 채널 없음27.03런칭 · 보도자료 배포마케터대표이사보도 게재-기준정보 · 역할 정의고문과 대표이사는 실행 항목을 갖지 않는다. 검수 열에만 등장한다.역할구분담당 범위이 사람이 막히면 멈추는 것대표이사검수되돌릴 수 없는 것만 본다 — 금액 확정(발주·수임료·계약금), 대외 발송(제안서·보도자료), 계약 체결, 채용, 런칭 시나리오발주, 가격 확정, 계약 체결, 대외 발송고문검수전문성 판단이 필요한 것만 본다 — 제품 분류, 표시사항, 소구 문구, IP 출원 전략, 인허가·수출국 요건제품 분류, 상표·특허 출원, 인허가BM실행브랜드 총괄. 제품 스펙, 제조사 커뮤니케이션, 규제 서류 취합, 바코드·SKU, 인허가 실무, 런칭 일정 관리서류 패키지 전부, 바코드, 표시사항, 제조사마케터실행콘텐츠 기획, 광고 집행, 소구 설계, 표시광고 실무, 언론보도, SNS, 시딩상세페이지, 소구 문구, 런칭 홍보디자이너실행BI, 패키지 아트웍, 상세페이지, 제품 촬영, 디자인권 출원 도면패키지 인쇄, 상세페이지, 상표 도형MD실행유통 입점, 채널 가격·마진 설계, 발주·재고, 해외 바이어 발굴, 자사몰판매 채널, 초도 발주, 가격표경영지원실행법인 등록·신고, 통장·자금, 세무, 보험, 물류 계약, IP 출원 행정, 계약서 관리, 인사판매 자격 전부, 자금 흐름, 상표 출원검수 원칙검수 대상은 되돌릴 수 없는 항목에만 건다. 되돌릴 수 있는 일까지 검수를 걸면 병목이 대표·고문에게 몰린다.대표이사 검수 = 금액 확정 · 대외 발송 · 계약 체결 · 채용 · 런칭 시나리오고문 검수 = 제품 분류 · 표시사항 · 소구 문구 · IP 출원 전략 · 인허가 요건검수 열이 빈 항목은 실행자 판단으로 종결한다. 별도 보고하지 않는다.검수 절차: 실행자가 상태를 ''완료''로 바꾸고 검수완료를 ''대기''로 둔다. 검수자가 ''승인'' 또는 ''반려''로 바꾼다.반려 시 상태를 ''진행''으로 되돌리고 대기대상에 검수자를 적는다.적용범위가 ''전사''인 항목은 두 법인 공통이다. 한쪽에서 완료하면 다른 파일에서도 완료로 표시한다.상태값 / 검수값상태: 미착수 / 진행 / 완료 / 지연 / 보류 / 해당없음검수완료: 대기 / 승인 / 반려우선순위: 최우선 / 높음 / 일반색상: 빨강 = 기한 초과 · 노랑 = D-3 이내 · 주황 = 기한 미정 최우선 · 회색 = 완료 · 파랑 = 검수 대상 · 초록 = 전사 공통확인 필요1. 런칭 차수 — 13종 동시 / 1차 4종(애씨드필·진정광크림·오일클렌저·폼클렌저) 분할 결정 필요2. 법인·브랜드 표기 — NA:AH / 나아 / 더나아 중 확정 필요. 콜론은 도메인 사용 불가3. 런칭일 — 목표는 27.01이나 개발 리스트상 입고가 27.02. 시트는 27.03 런칭 기준으로 역산4. 바나나팩토리 CGMP · ISO 22716 보유 여부 및 책임판매업 지원 범위5. 미정 5종 제조사 — 선크림(CIT) 외 앰플세럼·크림·앰플미스트·마스크팩 공란6. 책임판매관리자 — 내부 유자격자 없음 확인. 채용 또는 외부 위탁 선임 결정 필요7. 톤업 이너뷰티 세트 — 화장품(나아) + 건기식(하루바른) 결합. 판매 주체 법인 미확정8. 개발 리스트의 타겟 제품명 — 경쟁사 제품명 그대로 기재됨. 내부 코드 치환 필요9. 마케터 · MD 2개 역할 공석 (BM · 디자이너는 내부 보유)10. 각 항목의 예산 — 금액은 기재하지 않음. 대표 확정 후 반영나아 런칭 후 판매플랜 (런칭 2027-03 기준, 1차 8종)런칭일 확정 시 완료목표일을 일괄 이동시킨다. 컬럼 구조는 런칭체크리스트와 동일하다.No적용범위카테고리항목담당(실행)협업검수우선순위선행조건완료목표일D-Day상태검수완료대기대상비고', null, null, 122)
) as v(slug, scope, seq, category, item, owner_role, collab, reviewer, priority, prereq, due, note, so)
left join public.brands b on nullif(v.slug,'') = b.slug;

-- 2) 상세페이지 수정안 ------------------------------------------------------
create table if not exists public.launch_page_revisions (
  id          uuid primary key default gen_random_uuid(),
  product     text not null,                        -- 제품명
  section     text not null,                        -- 섹션
  original    text,                                 -- 현재 원문/항목
  grade       text,                                 -- A / B / C / 유지
  action      text,                                 -- 조치
  revision    text,                                 -- 수정안
  rationale   text,                                 -- 근거·비고
  sort_order  int not null default 0,
  seed_tag    text
);
create index if not exists launch_page_revisions_product_idx on public.launch_page_revisions(product);
alter table public.launch_page_revisions enable row level security;
drop policy if exists launch_page_revisions_all on public.launch_page_revisions;
create policy launch_page_revisions_all on public.launch_page_revisions for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

delete from public.launch_page_revisions where seed_tag = '⟦수정안시드⟧';
insert into public.launch_page_revisions (product, section, original, grade, action, revision, rationale, sort_order, seed_tag) values
  ('서리블랙', 'S1 히어로', '가품·유사품에 주의하세요! 서리블랙 정품, 공식 판매처에서 만나보세요', 'A', '삭제', '「서리블랙 공식 판매처」 배너만 유지', '런칭 전 제품에 가품이 존재할 수 없다. 레퍼런스(서리맥스) 문구를 그대로 옮긴 것. 소비자 기만', 1, '⟦수정안시드⟧'),
  ('서리블랙', 'S1 히어로', '자꾸 눈이 가는 정수리 / 매일 한 알로 채우는 풍성한 자신감', '유지', '유지', '그대로 사용', '질병명 없음. ''자신감''이 목적어라 신체 효능 단정이 아니다. 4종 중 가장 잘 쓴 카피', 2, '⟦수정안시드⟧'),
  ('서리블랙', 'S1 히어로', '그냥 볶지 않았습니다 / 볶음 후 발효까지, 두 번의 공정을 거친 서리태', '유지', '유지', '그대로 사용', '공정 사실 진술', 3, '⟦수정안시드⟧'),
  ('서리블랙', 'S1 히어로', '모발 구성성분까지 그대로', 'B', '수정', '모발을 이루는 성분과 같은 원료를', '''구성성분까지 그대로''는 제품이 모발을 구성한다는 오인 소지. 한 단어만 바꾸면 해소', 4, '⟦수정안시드⟧'),
  ('서리블랙', 'S1 히어로', '매일, 기본을 채우다 / 비타민 12종, 미네랄까지 한 알에', '유지', '유지', '그대로 사용', '사실 표기 + 정서 동사', 5, '⟦수정안시드⟧'),
  ('서리블랙', 'S2 문제제시', '많이 챙긴다고 다 맞게 챙긴 걸까요? / 따로 챙길 필요 없어요, 이제 서리블랙 하나로', '유지', '유지', '그대로 사용', '이 섹션 전체가 C등급. 손댈 것 없음', 6, '⟦수정안시드⟧'),
  ('서리블랙', 'S3 체크리스트', '거울 볼 때마다 자꾸 정수리를 먼저 살피게 되는 분', '유지', '유지', '그대로 사용', '증상 서술이 아닌 상황·심리 묘사', 7, '⟦수정안시드⟧'),
  ('서리블랙', 'S3 체크리스트', '헤어에 바르는 관리는 물론 섭취 관리까지 챙기고 싶으신 분', 'B', '수정', '바르는 것 말고도 안에서부터 챙기고 싶으신 분', '''관리''가 탈모 관리로 읽힌다. ''관리'' 두 번을 빼면 해소', 8, '⟦수정안시드⟧'),
  ('서리블랙', 'S4 이중공정', '흡수까지 고려한 두 번의 공정', 'B', '수정', '발효를 한 번 더 거친 이유', '''흡수''는 체내 흡수율 주장. 공정을 말하는 문장이므로 공정으로 끝내면 된다', 9, '⟦수정안시드⟧'),
  ('서리블랙', 'S4 이중공정', '발효 후 검정콩의 항산화·플라보노이드 함량 증가 (논문 인용)', 'B', '조건부', '「발효 서리태 원료에 대한 연구」로 제목 변경 · 균주명(Bacillus subtilis)·시험조건 명시 + ''제품이 아닌 원료에 대한 설명입니다'' 각주 병기', '선행 확인 필수 — 원료사 스펙에서 실제 발효 시간·균주가 논문과 동일한지 확인. 다르면 전체 삭제', 10, '⟦수정안시드⟧'),
  ('서리블랙', 'S4 이중공정', '국내 최초 129시간 발효 서리태 (레퍼런스)', 'A', '차용금지', '가져오지 않는다', '서리맥스의 문구. 우리가 쓰면 허위 + 부당비교', 11, '⟦수정안시드⟧'),
  ('서리블랙', 'S5 안토시아닌', '안토시아닌: 껍질에 있는 짙은 색소 성분 / 이소플라본: 콩에 함유된 대표적인 식물성 성분', '유지', '유지', '그대로 사용', '성분의 정의 진술. 효능 주장이 없다', 12, '⟦수정안시드⟧'),
  ('서리블랙', 'S5 안토시아닌', '한 가지 콩으로는 아쉬우니까, 블랙 원료를 한 겹 더', '유지', '유지', '그대로 사용', '배합 사실 + 정서 표현', 13, '⟦수정안시드⟧'),
  ('서리블랙', 'S6 모발구성원료', '모발의 90% 이상이 케라틴 단백질 / 케라틴을 이루는 핵심 아미노산, 시스테인', '유지', '유지', '그대로 사용', '이 기획안의 최고 지점. 구성성분 논리의 모범 사례', 14, '⟦수정안시드⟧'),
  ('서리블랙', 'S6 모발구성원료', '엘라스틴: 탄력을 이루는 단백질 성분', 'B', '수정', '엘라스틴: 피부와 결합조직에 존재하는 단백질 성분', '''탄력을 이루는''이 모발 탄력 개선으로 읽힌다', 15, '⟦수정안시드⟧'),
  ('서리블랙', 'S6 모발구성원료', '초저분자 피쉬콜라겐: 모발과 두피를 구성하는 단백질', 'A', '수정', '초저분자 피쉬콜라겐: 저분자로 가공한 콜라겐 펩타이드', '사실 오류. 모발의 구성 단백질은 케라틴이지 콜라겐이 아니다', 16, '⟦수정안시드⟧'),
  ('서리블랙', 'S7 부원료', '모발의 재료만 챙기면 충분할까요? / 모발을 생각한 설계, 빈틈없이 채웠습니다', '유지', '유지', '그대로 사용', '설계·구성 서술', 17, '⟦수정안시드⟧'),
  ('서리블랙', 'S7 부원료', 'AI 여성 이미지 + 긴 모발 강조 연출', 'B', '수정', '제품 중심 컷으로. 모발 클로즈업·전후 대비 연출은 배제', '비주얼도 광고다. 풍성한 모발을 강조하면 문구 없이도 효과 암시', 18, '⟦수정안시드⟧'),
  ('서리블랙', 'S8 복용법', '하루 한 알로 간편하게 / 하루 1회, 한번에 1정', 'B', '확인', '표시사항의 권장섭취량과 대조 후 확정', '바비컷·레몽드올리 라벨은 ''1일 1회 2정''인데 상세페이지는 1정. 서리블랙도 확인 필요', 19, '⟦수정안시드⟧'),
  ('서리블랙', 'S8 클로징', '이제 제대로 챙길 차례 / 따로 챙기지 말고 서리블랙 하나로 시작하세요', '유지', '유지', '그대로 사용', '손댈 것 없음', 20, '⟦수정안시드⟧'),
  ('서리블랙', '내부기획메모', '두피 혈액 순환을 돕고 탈모 원인 물질 작용을 간접적으로 억제해 모발 강화에 도움', 'A', '반영금지', '상세페이지·SNS·인플루언서 가이드 어디에도 반영하지 않는다', '질병명(탈모)+신체기능(혈액순환)+억제. 3중 위반. 벌칙 조항 최상단', 21, '⟦수정안시드⟧'),
  ('서리블랙', '내부기획메모', '콜라겐 펩타이드 / 엘라스틴: 모발 굵기 개선 등의 가능성에 도움을 줌', 'A', '반영금지', '반영하지 않는다', '''개선''과 ''도움''은 기능성 표현. 내부 검토 언어로만 유지', 22, '⟦수정안시드⟧'),
  ('바비컷', '전체 축', '지방·탄수화물을 비우는 식전 습관 (페이지 전체의 뼈대)', 'A', '재설계', '새 축: 「먹는 날의 아주 작은 습관」 — 무엇이 몸에서 일어나는가를 빼고, 언제 어떻게 먹는가로 전환', '효능 소구가 뼈대라 부분 수정으로 해결되지 않는다. 축을 갈아야 한다', 23, '⟦수정안시드⟧'),
  ('바비컷', 'S1 히어로', '먹는 밥이 버거운 날 / 내 몸을 더 가볍게 사랑하는 방법', '유지', '유지', '그대로 사용', '정서 카피. 새 축의 출발점', 24, '⟦수정안시드⟧'),
  ('바비컷', 'S1 히어로', '참는 다이어트는 오래 못 가니까 / 참지 말고, 바비컷 하세요', 'A', '수정', '참는 건 오래 못 가니까 / 식전 2정, 그게 전부입니다', '''다이어트''만 빼면 문장 구조와 리듬은 그대로 산다', 25, '⟦수정안시드⟧'),
  ('바비컷', 'S1 히어로', '지방·탄수화물을 비우는 식전 습관 / 탄수화물 루틴을 비우는', 'A', '수정', '약속 많은 주의 식전 습관', '''비우는''은 흡수 저해 주장. 습관이라는 단어는 살린다', 26, '⟦수정안시드⟧'),
  ('바비컷', 'S1 배지 4종', '재구매율 90% 이상 / 재구매율 97% / 누적판매 00만 / 탄수화물 억제 카테고리 1위', 'A', '전면교체', '새 배지 4종: 「알파사이클로덱스트린 함유」 「안티카브-S 복합물 80%」 「HACCP 인증 시설 제조」 「1일 2정·60정」', '존재하지 않는 실적. 사실 기반 배지로 교체하면 신뢰 요소는 유지', 27, '⟦수정안시드⟧'),
  ('바비컷', 'S1 배지', '정품 알파 CD 순도 100% / 프리미엄 알파CD', 'B', '수정', 'WACKER사 알파사이클로덱스트린 (미국산)', '''순도 100%''는 시험성적서 필요. ''프리미엄''은 근거 없는 우수성', 28, '⟦수정안시드⟧'),
  ('바비컷', 'S2 원료', '전세계가 주목한 ''미국 프리미엄 원료''', 'B', '수정', '미국산 알파사이클로덱스트린', '''전세계가 주목한''은 근거 없는 표현. 원산지 사실만', 29, '⟦수정안시드⟧'),
  ('바비컷', 'S2 원료', '먹고 싶은거 다 먹고 유지하는 비결', 'A', '수정', '먹는 날에도 챙기는 습관 하나', '''유지''가 체중 유지로 읽힌다', 30, '⟦수정안시드⟧'),
  ('바비컷', 'S2 차별화표', '일반 알파 CD 제품 vs 바비컷 / 지방 대응만 → 지방·탄수화물 이중 대응', 'A', '재구성', '비교 열을 지우고 자사 배합만 서술: 「안티카브-S 복합물에 담긴 4가지 원료군」', '부당 비교광고 + ''대응''은 기능성 표방', 31, '⟦수정안시드⟧'),
  ('바비컷', 'S3 USP', '4-Layer로 완성한 바비컷만의 시너지 포뮬러', 'B', '수정', '4가지 원료군을 하나에 담은 안티카브-S 복합물', '미투 상품이므로 ''바비컷만의''는 사실과 다르다', 32, '⟦수정안시드⟧'),
  ('바비컷', 'S3 USP', '1.지방 대응-배출 / 2.탄수화물 대응-당분해 저하 / 3.식이섬유·포만 / 4.장 밸런스', 'A', '재작성', '① 알파사이클로덱스트린(옥수수·감자 유래) ② 흰강낭콩·바나바잎 ③ 치커리뿌리추출분말(식이섬유 80%↑)·난소화성말토덱스트린 ④ 혼합유산균 8종', '구성성분 논리 적용 — 무엇을 한다가 아니라 무엇이 들어 있다', 33, '⟦수정안시드⟧'),
  ('바비컷', 'S3 효능후킹1', '알파 CD 36,000mg 섭취 시 지방량 324g / 열량 2,916kcal', 'A', '삭제', '대체: 「1정에 알파사이클로덱스트린 187.2mg」', '제품 효능 수치화. 36,000mg은 약 96일치라 1회로 오인', 34, '⟦수정안시드⟧'),
  ('바비컷', 'S3 효능후킹1', 'Alpha-CD는 자기 무게 9배 지방을 끌어당겨 체내 흡수 없이 배출을 돕습니다', 'A', '삭제', '삭제', '흡수 저해·배출 주장. 각주로 면책되지 않는다', 35, '⟦수정안시드⟧'),
  ('바비컷', 'S3 USP', '탄수화물을 당으로 쪼개는 소화효소(아밀레이스)의 작용에 관여', 'A', '삭제', '삭제', '효소 작용 관여 = 신체 기능 주장', 36, '⟦수정안시드⟧'),
  ('바비컷', 'S4 효능후킹2', '삼겹살 200g 지방 83g = 747kcal = 등산 110분 (식약처 DB 출처)', 'B', '분리유지', '유지하되 제품 이미지와 같은 화면에 배치하지 않는다. 각주 「본 정보는 건강 정보이며 제품과 무관합니다」 유지', '식약처 DB 일반 건강정보라 그 자체는 통과. 제품 옆에 놓으면 효능 소구', 37, '⟦수정안시드⟧'),
  ('바비컷', 'S5 포인트', '지방, 탄수화물 대응 / 8종 유산균으로 장밸런스까지', 'A', '재작성', '01. 안티카브-S 복합물 80% 배합 / 02. 치커리뿌리추출분말·난소화성말토덱스트린·혼합유산균 8종 함유 / 03. HACCP 인증 시설 제조 / 04. 하루 한 번 2정', '원재료 나열로 전환', 38, '⟦수정안시드⟧'),
  ('바비컷', 'S5 추천대상', '화장실 활동이 원활하지 않으신 분', 'A', '삭제', '삭제', '배변 기능 소구', 39, '⟦수정안시드⟧'),
  ('바비컷', 'S5 추천대상', '배달음식·밀가루 음식 섭취가 잦으신 분 / 탄수화물·야식 습관을 끊기 어려운 분', '유지', '유지', '그대로 사용', '식습관 묘사. 증상이 아니다', 40, '⟦수정안시드⟧'),
  ('바비컷', 'S6 POINT01', '9배 배출력 확인 / 연구 논문 (α-Cyclodextrin postprandial lipid)', 'A', '삭제', '삭제', '원료 논문을 제품 효능 근거로 전환. 인용 자체가 기능성 표방', 41, '⟦수정안시드⟧'),
  ('바비컷', 'S6 POINT01', '연구 근거와 FDA 안정성까지, 신뢰를 더한 원료', 'A', '삭제', '삭제', 'FDA는 식품원료를 승인하지 않는다. 거짓 표시', 42, '⟦수정안시드⟧'),
  ('바비컷', 'S7 POINT02', '수용성 식이섬유로 대장에서 수분을 흡수해 원활한 소화와 배변을 돕습니다 / 쾌변으로 시너지 UP', 'A', '삭제', '「치커리뿌리추출분말 (식이섬유 80%↑ / 벨기에산)」 사실 표기로 대체', '장 건강은 건기식 인정 기능성 문구', 43, '⟦수정안시드⟧'),
  ('바비컷', 'S8 POINT03', 'ISO 14001 / ISO 9001 / HACCP 로고', 'B', '표기수정', '「HACCP 인증 시설에서 제조」 문장 + 제조사 명기. 로고를 브랜드 상단에 크게 배치하지 않는다', '제조사 인증을 브랜드 인증으로 오인시키면 위반', 44, '⟦수정안시드⟧'),
  ('바비컷', 'S9 FAQ', '추가 섭취를 원하시면 하루 3회 아침/점심/저녁 식전 2정씩 (최대 6정)', 'A', '수정', '표시사항 그대로: 「1일 1회 2정, 충분한 물과 함께 섭취」', '라벨 권장량 초과 권유. 표시사항 위반이자 안전 이슈', 45, '⟦수정안시드⟧'),
  ('바비컷', 'S9 FAQ', '미국 FDA에 승인된 원료의 안전한 식품으로, 건강한 성인이라면 누구나 섭취 가능', 'A', '수정', '표시사항 그대로: 「특이체질·알레르기체질, 임신·수유부 및 질병 치료 중인 분은 성분 확인 후 섭취」', '질문은 임산부·수유부·어린이인데 답은 성인 기준. 자기모순 + 안전성 단정', 46, '⟦수정안시드⟧'),
  ('바비컷', '전체', '브랜드명 혼재 — 바비컷 / 바비시로 / BARBISIRO', 'B', '통일', '국문·영문 각 하나로 확정 후 전 페이지 일괄 치환', '상표 출원 전 확정. 기획안 3곳에서 다르게 나온다', 47, '⟦수정안시드⟧'),
  ('레몽드올리', '전체 축', '번거로운 아침 루틴 → 한 알로 3초 (페이지의 뼈대)', '유지', '유지', '이 축을 그대로 유지한다', '어떻게 먹는가를 말한다. 규제를 건드리지 않으면서 소구가 명확', 48, '⟦수정안시드⟧'),
  ('레몽드올리', 'S1 히어로', '건강한 하루를 여는, 간편한 한 알 / 올리브잎의 깊은 생명력과 레몬의 싱그러움', '유지', '유지', '그대로 사용', '정서 카피', 49, '⟦수정안시드⟧'),
  ('레몽드올리', 'S1 히어로', '올리브 오일만 챙기고 있다면 올리브의 핵심을 놓치고 있습니다', 'B', '수정', '우리가 주목한 건 올리브 열매가 아니라 올리브잎입니다', '타 제품군 폄하로 읽힌다. 자사 선택 이유로 바꾸면 메시지는 그대로', 50, '⟦수정안시드⟧'),
  ('레몽드올리', 'S2 지중해', '강력한 항산화 에너지를 품은, 올리브잎', 'B', '수정', '폴리페놀 계열 성분 올레우로핀을 지닌, 올리브잎 (*원료에 대한 설명입니다)', '원료를 주어로 두고 각주. ''강력한''은 삭제', 51, '⟦수정안시드⟧'),
  ('레몽드올리', 'S2 지중해', '콜라겐·유산균·글루타치온의 뷰티 밸런스 / 이너뷰티 밸런스', 'B', '수정', '콜라겐·혼합유산균 21종·리포좀 글루타치온 함유', '''밸런스''는 신체 균형 조절로 읽힌다. 함유 사실만', 52, '⟦수정안시드⟧'),
  ('레몽드올리', 'S3 번거로움', '계량하고, 짜고, 섞는 번거로움부터 오일의 느끼함과 공복 섭취의 부담까지 / 아침 공복, 한 알로 시작하는 3초 루틴', '유지', '유지', '그대로 사용', '페이지에서 가장 강한 부분. 손대지 않는다', 53, '⟦수정안시드⟧'),
  ('레몽드올리', 'S4 3가지이유', '산화 스트레스를 관리하는 저속노화 루틴', 'A', '수정', '매일 같은 시간에 반복하는 아침 루틴', '''저속노화''와 ''산화 스트레스 관리''는 노화 관련 기능성 표방', 54, '⟦수정안시드⟧'),
  ('레몽드올리', 'S4 기간별', '1개월 가벼움의 시작 / 3개월 균형의 변화, 피부에 생기 / 6개월 건강한 활력의 완성', 'A', '삭제', '슬라이드 전체 삭제. 대체 시 「4주, 8주, 12주 — 루틴이 습관이 되는 시간」처럼 행동 기준으로만', '기간별 효과 단정. 4종 중 가장 위험한 슬라이드', 55, '⟦수정안시드⟧'),
  ('레몽드올리', 'S4 기간별', '레몽드올리가 일상이 될수록 건강한 변화가 차곡차곡 쌓입니다', 'A', '수정', '레몽드올리가 일상이 될수록 아침이 단순해집니다', '''건강한 변화''는 효능 암시. 목적어를 행동으로 바꾼다', 56, '⟦수정안시드⟧'),
  ('레몽드올리', 'S4 원료', '열매나 오일의 00배 높은 올레우로핀 함량', 'B', '삭제', '삭제. 배수 사용 시 시험성적서 확보 후 시험기관·조건 병기', '자리표시자 00이 그대로 남아 있다. 배수 비교는 실증 대상', 57, '⟦수정안시드⟧'),
  ('레몽드올리', 'S4 원료', '프리미엄 지중해 복합 레시피를 과학적으로 설계했습니다', 'B', '수정', '지중해 식문화에서 착안해 원료를 조합했습니다', '''과학적으로''는 실증 대상', 58, '⟦수정안시드⟧'),
  ('레몽드올리', 'S5 차별화', '올리브오일에는 극미량으로 존재하는 올레우로핀은 올리브잎에 건조 중량의 6~9%까지 함유', 'B', '조건부', '유지하되 「*원료의 특성에 대한 설명이며 제품 함량과 다릅니다」 각주 병기', '원료 문헌 사실. 각주 없이 두면 제품 함량으로 오인', 59, '⟦수정안시드⟧'),
  ('레몽드올리', 'S6 리뷰', '레몽드올리와 함께한 고객님들의 리얼 리뷰 (2026.08 자사몰 기준 / 추후 기재 예정)', 'A', '삭제', '슬라이드 삭제. 실제 구매 리뷰가 쌓인 뒤 실데이터로 재제작', '런칭 전 제품에 리뷰가 존재할 수 없다', 60, '⟦수정안시드⟧'),
  ('레몽드올리', 'S7 레몬', '레몬밤: 편안한 휴식과 항산화 밸런스 / 레몬버베나: 긴장을 덜어주는 편안한 허브 밸런스', 'A', '수정', '레몬밤: 로즈마린산을 지닌 허브 (프랑스산) / 레몬버베나: 버바스코사이드를 지닌 허브 (파라과이산)', '''편안한 휴식''과 ''긴장을 덜어주는''은 수면·진정 기능성 표방', 61, '⟦수정안시드⟧'),
  ('레몽드올리', 'S7 레몬', '산뜻한 에너지부터 항산화 활력, 편안한 휴식까지', 'A', '수정', '레몬을 한 가지로 끝내지 않은 이유 — 과즙, 잎, 허브를 각각', '복합 기능성 나열', 62, '⟦수정안시드⟧'),
  ('레몽드올리', 'S8 올리브잎', '산화 스트레스로부터 균형을 지키는 올리브잎 폴리페놀', 'B', '수정', '올리브잎이 지닌 폴리페놀 계열 성분, 올레우로핀 (*원료에 대한 설명입니다)', '''~로부터 지키는''은 방어 기능 주장. 성분 정의로 전환', 63, '⟦수정안시드⟧'),
  ('레몽드올리', 'S9 근거', '올리브의 핵심 영양소를 매일 5mg 이상 꾸준히 섭취할 때 그 가치가 시작됩니다', 'A', '삭제', '삭제', '유효섭취량 제시 = 기능성 표방', 64, '⟦수정안시드⟧'),
  ('레몽드올리', 'S10 이너뷰티', '콜라겐: 탄탄한 아름다움의 기반을 채우는 피부 단백질', 'A', '수정', '초저분자 피쉬콜라겐 펩타이드 함유', '피부 기능성 표방', 65, '⟦수정안시드⟧'),
  ('레몽드올리', 'S10 이너뷰티', '프리미엄 유산균: 장내 균형을 고려한 21종 유산균', 'A', '수정', '혼합유산균 21종 함유', '장 기능성 표방', 66, '⟦수정안시드⟧'),
  ('레몽드올리', 'S10 이너뷰티', '리포좀 글루타치온: 리포좀 기술로 섬세하게 감싸 흡수력을 높인 항산화', 'A', '수정', '리포좀 L-글루타치온 효모 90 함유 (인도산)', '흡수율 주장 + 항산화', 67, '⟦수정안시드⟧'),
  ('레몽드올리', 'S10 원산지', '미국산 프리미엄 레몬 100% / 튀니지산 올리브잎 100%', 'B', '수정', '레몬 — 미국산 / 올리브잎 — 튀니지산 / 레몬밤 — 프랑스산 / 레몬버베나 — 파라과이산', '원산지 100%인데 함량 100%로 오인', 68, '⟦수정안시드⟧'),
  ('레몽드올리', 'S10 원산지', '레몬과즙 96%', 'B', '확인', '96%의 기준(원료 내 비율 / 제품 내 함량) 명시하거나 삭제', '레몬과즙분말 안에 덱스트린·아라비아검·구연산·향료가 함께 있다', 69, '⟦수정안시드⟧'),
  ('레몽드올리', 'S11 클로징', '세계가 인정한 레몽드올리 원재료 품질', 'A', '수정', '원료를 고르는 기준부터', '근거 없는 최상급', 70, '⟦수정안시드⟧'),
  ('레몽드올리', 'S11 클로징', '꾸준한 루틴의 시작은 의지가 아닌 간편함입니다', '유지', '유지', '그대로 사용', '이 페이지에서 가장 좋은 문장', 71, '⟦수정안시드⟧'),
  ('레몽드올리', 'S12 FAQ', '1일 1~3정을 개인의 기호에 따라 드셔도 됩니다', 'A', '수정', '표시사항 그대로: 「1일 1회 2정, 충분한 물과 함께 섭취」', '섭취량 자유화. 표시사항 위반 + 안전 이슈', 72, '⟦수정안시드⟧'),
  ('레몽드올리', 'S12 HOW TO', '매일 아침, 물 1잔과 레몽드올리 1알 / 4주 이상 꾸준히 섭취', 'A', '수정', '매일 아침, 물 1잔과 레몽드올리 2정 / 매일 같은 시간에 챙겨보세요', '표시사항은 2정인데 1알. ''4주 이상''은 기간 효과 암시', 73, '⟦수정안시드⟧'),
  ('레몽드올리', '전체', '브랜드명 혼재 — 레몽드올리 / 레몽드 올리 / 레몬드올리 / 레몽드오리 / LEMONDEOLI / LEMONDE-OLI', 'B', '통일', '국문·영문 각 하나로 확정 후 전 페이지 일괄 치환', '여섯 가지 표기가 섞여 있다', 74, '⟦수정안시드⟧'),
  ('리셀바인(NMN)', '선행조건', '리셀바인(NMN) 식품원료 사용 적법성', 'A', '확인필수', '한솔에 확인: ① NMN이 식품공전 등재 원료인지 ② 한시적 인정 원료라면 인정 주체가 누구인지', 'NMN은 국내 건기식 원료로 인정되지 않았다. 확인 전에는 상세페이지 작업 시작 금지', 75, '⟦수정안시드⟧'),
  ('리셀바인(NMN)', '카테고리', '항노화·항산화 (생산리스트 기재 카테고리)', 'A', '재정의', '마케팅에 그대로 쓰지 않는다. 노출 카테고리는 ''기타가공품'' 또는 ''건강식품''으로', '''항노화''는 건기식 기능성에도 없는 표현. ''항산화''는 건기식 인정 기능성이라 일반식품 사용 불가', 76, '⟦수정안시드⟧'),
  ('리셀바인(NMN)', '예상 소구', 'NAD+ / 세포 / 회춘 / 젊음 / 노화 지연 / 미토콘드리아', 'A', '전면금지', '사용하지 않는다', 'NMN 마케팅 표준 소구가 전부 A등급. 소구 여지가 가장 좁다', 77, '⟦수정안시드⟧'),
  ('리셀바인(NMN)', '예상 소구', '해외에서 주목받는 원료 / 하버드 / 논문', 'A', '삭제', '사용하지 않는다', '권위 차용 + 효능 암시', 78, '⟦수정안시드⟧'),
  ('리셀바인(NMN)', '사용 가능', '원재료명·함량 사실 표기 / 섭취 방법 / 정제 형태 / 제조 시설', '유지', '사용', '「니코틴아미드 모노뉴클레오티드 함유 / 1일 2정 / HACCP 인증 시설 제조」', 'C등급. 다만 이것만으로 페이지 채우기 어렵다', 79, '⟦수정안시드⟧'),
  ('리셀바인(NMN)', '전략 판단', '4종 중 유일하게 소구 축이 서지 않는 제품', '', '결정필요', '선택지: ① 원료 사실 + 루틴 소구 최소 구성 ② 런칭 보류 후 원료 적법성 확인 ③ 세트 구성의 부속 SKU로 배치', '발주·선결제 완료 상태이므로 ③이 현실적. 리셀바인을 단독으로 밀지 않고 세트에 넣는 방식', 80, '⟦수정안시드⟧');

-- 3) 신규 MD(채용예정) 계정 — 체크리스트 MD 담당 업무 및 미배정 업무의 담당자
insert into public.users (email, name, role, job_title) values
  ('md@harubareun.com', '신규 MD', 'staff', 'MD')
on conflict (email) do update set name = excluded.name, job_title = excluded.job_title;

-- 4) 런칭 항목은 전용 런칭준비 폴더로 이관. 일반 업무투두의 런칭 시드 제거.
delete from public.todos where note like '%⟦런칭시드⟧%';

-- 5) 일반 업무투두에 남은 미배정(담당자 없음) 업무는 신규 MD에게 배정
update public.todos t
set assignee_user_id = m.id,
    assignee_user_ids = array[m.id]
from public.users m
where m.email = 'md@harubareun.com'
  and t.assignee_user_id is null
  and coalesce(cardinality(t.assignee_user_ids), 0) = 0;


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


-- ============================================================================
-- 0084 — 런칭 업무를 업무투두에도 미러링
-- 런칭준비 폴더(launch_checklist)와 업무투두(todos) 양쪽에서 보이게 한다.
-- todos는 launch_checklist에서 파생 — 담당(실행) 역할을 담당자로 매핑해 배정.
-- 선행: 0082(launch_checklist 시드 + 신규 MD 계정), 0079(구성원 계정).
-- ============================================================================

-- 기존 런칭 시드 투두 제거(재실행 안전).
delete from public.todos where note like '%⟦런칭시드⟧%';

insert into public.todos
  (title, brand_id, assignee_user_id, assignee_user_ids, priority, status, due_date, note)
select
  '[' || c.category || '] ' || c.item,
  c.brand_id,
  u.id,
  case when u.id is not null then array[u.id] else '{}'::uuid[] end,
  case c.priority when '최우선' then '높음' when '높음' then '높음' else '보통' end,
  '예정',
  c.due_date,
  '담당 ' || coalesce(nullif(c.owner_role, ''), '-')
    || case when coalesce(c.collab, '')   <> '' then ' · 협업 ' || c.collab   else '' end
    || case when coalesce(c.reviewer, '') <> '' then ' · 검수 ' || c.reviewer else '' end
    || ' ⟦런칭시드⟧'
from public.launch_checklist c
left join (values
  ('경영지원', '박종혁'),
  ('BM',      '김려은'),
  ('마케터',   '차민준'),
  ('디자이너', '한여정'),
  ('고문',     '최운호'),
  ('대표이사', '서현옥'),
  ('MD',      '신규 MD')
) as m(role, person) on m.role = c.owner_role
left join public.users u on u.name = m.person
where c.seed_tag = '⟦런칭체크시드⟧';


-- ============================================================================
-- 0085 — 업무투두 중복 제거
-- 원인: 런칭 시드가 두 번 이상 적용되어 같은 업무가 중복 생성됨.
-- 해결:
--  1) 런칭 시드(⟦런칭시드⟧)를 전량 삭제 후 launch_checklist에서 정확히 1건씩 재삽입.
--  2) 그 외 완전 중복(제목·브랜드·마감·담당자·상태 동일) 행을 1건만 남기고 삭제.
-- 선행: 0082(launch_checklist + 신규 MD), 0079(구성원 계정).
-- 재실행 안전.
-- ============================================================================

-- 1) 런칭 시드 정규화 --------------------------------------------------------
delete from public.todos where note like '%⟦런칭시드⟧%';

insert into public.todos
  (title, brand_id, assignee_user_id, assignee_user_ids, priority, status, due_date, note)
select
  '[' || c.category || '] ' || c.item,
  c.brand_id,
  u.id,
  case when u.id is not null then array[u.id] else '{}'::uuid[] end,
  case c.priority when '최우선' then '높음' when '높음' then '높음' else '보통' end,
  '예정',
  c.due_date,
  '담당 ' || coalesce(nullif(c.owner_role, ''), '-')
    || case when coalesce(c.collab, '')   <> '' then ' · 협업 ' || c.collab   else '' end
    || case when coalesce(c.reviewer, '') <> '' then ' · 검수 ' || c.reviewer else '' end
    || ' ⟦런칭시드⟧'
from public.launch_checklist c
left join (values
  ('경영지원', '박종혁'),
  ('BM',      '김려은'),
  ('마케터',   '차민준'),
  ('디자이너', '한여정'),
  ('고문',     '최운호'),
  ('대표이사', '서현옥'),
  ('MD',      '신규 MD')
) as m(role, person) on m.role = c.owner_role
left join public.users u on u.name = m.person
where c.seed_tag = '⟦런칭체크시드⟧';

-- 2) 일반 완전중복 제거(가장 먼저 만들어진 1건만 유지) ------------------------
delete from public.todos t
using public.todos k
where t.ctid > k.ctid
  and t.title = k.title
  and coalesce(t.brand_id::text, '∅')         = coalesce(k.brand_id::text, '∅')
  and coalesce(t.due_date::text, '∅')         = coalesce(k.due_date::text, '∅')
  and coalesce(t.assignee_user_id::text, '∅') = coalesce(k.assignee_user_id::text, '∅')
  and coalesce(t.status, '∅')                 = coalesce(k.status, '∅');


-- ============================================================================
-- 0086 — 업무투두 런칭 업무 정규화(중복 확정 제거)
-- 0085의 태그 기반 삭제로 안 잡히는 중복까지 제거하기 위해, 런칭 업무를
-- '제목이 launch_checklist 항목과 일치'하는 기준으로 전량 삭제 후 1건씩 재삽입.
-- 결과적으로 런칭 업무는 정확히 launch_checklist 건수(현재 122건)로 고정된다.
-- 선행: 0082(launch_checklist + 신규 MD), 0079(구성원 계정). 재실행 안전.
-- ============================================================================

-- 1) 런칭 업무 전량 삭제 — 제목 일치 또는 ⟦런칭시드⟧ 태그(태그 없는 과거 시드까지 포함)
delete from public.todos t
where t.note like '%⟦런칭시드⟧%'
   or exists (
        select 1 from public.launch_checklist c
        where t.title = '[' || c.category || '] ' || c.item
      );

-- 2) launch_checklist에서 정확히 1건씩 재삽입
insert into public.todos
  (title, brand_id, assignee_user_id, assignee_user_ids, priority, status, due_date, note)
select
  '[' || c.category || '] ' || c.item,
  c.brand_id,
  u.id,
  case when u.id is not null then array[u.id] else '{}'::uuid[] end,
  case c.priority when '최우선' then '높음' when '높음' then '높음' else '보통' end,
  '예정',
  c.due_date,
  '담당 ' || coalesce(nullif(c.owner_role, ''), '-')
    || case when coalesce(c.collab, '')   <> '' then ' · 협업 ' || c.collab   else '' end
    || case when coalesce(c.reviewer, '') <> '' then ' · 검수 ' || c.reviewer else '' end
    || ' ⟦런칭시드⟧'
from public.launch_checklist c
left join (values
  ('경영지원', '박종혁'),
  ('BM',      '김려은'),
  ('마케터',   '차민준'),
  ('디자이너', '한여정'),
  ('고문',     '최운호'),
  ('대표이사', '서현옥'),
  ('MD',      '신규 MD')
) as m(role, person) on m.role = c.owner_role
left join public.users u on u.name = m.person
where c.seed_tag = '⟦런칭체크시드⟧';

-- 3) 그 외 완전중복(제목·브랜드·마감·담당자·상태 동일)도 1건만 남기고 삭제
delete from public.todos t
using public.todos k
where t.ctid > k.ctid
  and t.title = k.title
  and coalesce(t.brand_id::text, '∅')         = coalesce(k.brand_id::text, '∅')
  and coalesce(t.due_date::text, '∅')         = coalesce(k.due_date::text, '∅')
  and coalesce(t.assignee_user_id::text, '∅') = coalesce(k.assignee_user_id::text, '∅')
  and coalesce(t.status, '∅')                 = coalesce(k.status, '∅');


-- ============================================================================
-- 0087 — 업무투두 런칭 업무 확정 리셋 (최종본)
-- 0080/0084/0086 등 여러 시드가 섞여 제목이 서로 달라 중복이 남는 문제를
-- 한 번에 정리한다. "[카테고리] 항목" 형식의 런칭성 업무를 전부 지우고,
-- launch_checklist(단일 원본, 중복 제거 후)에서 정확히 1건씩 재삽입한다.
-- 실행 후 런칭 업무는 정확히 launch_checklist 건수(현재 122건)로 고정된다.
-- 선행: 0082(launch_checklist + 신규 MD), 0079(구성원 계정). 재실행 안전.
-- 주의: 제목이 "[...] ..." 형식인 업무는 런칭 업무로 간주해 삭제 대상이 된다.
-- ============================================================================

-- 0) launch_checklist 자체 중복 제거((scope, seq) 기준 1건만 유지)
delete from public.launch_checklist a
using public.launch_checklist b
where a.ctid > b.ctid
  and a.scope = b.scope
  and a.seq   = b.seq;

-- 1) 모든 런칭성 todos 삭제: ⟦런칭시드⟧ 태그 또는 "[카테고리] " 형식 제목
delete from public.todos
where note like '%⟦런칭시드⟧%'
   or title like '[%] %';

-- 2) launch_checklist에서 정확히 1건씩 재삽입(담당자 매핑)
insert into public.todos
  (title, brand_id, assignee_user_id, assignee_user_ids, priority, status, due_date, note)
select
  '[' || c.category || '] ' || c.item,
  c.brand_id,
  u.id,
  case when u.id is not null then array[u.id] else '{}'::uuid[] end,
  case c.priority when '최우선' then '높음' when '높음' then '높음' else '보통' end,
  '예정',
  c.due_date,
  '담당 ' || coalesce(nullif(c.owner_role, ''), '-')
    || case when coalesce(c.collab, '')   <> '' then ' · 협업 ' || c.collab   else '' end
    || case when coalesce(c.reviewer, '') <> '' then ' · 검수 ' || c.reviewer else '' end
    || ' ⟦런칭시드⟧'
from public.launch_checklist c
left join (values
  ('경영지원', '박종혁'),
  ('BM',      '김려은'),
  ('마케터',   '차민준'),
  ('디자이너', '한여정'),
  ('고문',     '최운호'),
  ('대표이사', '서현옥'),
  ('MD',      '신규 MD')
) as m(role, person) on m.role = c.owner_role
left join public.users u on u.name = m.person
where c.seed_tag = '⟦런칭체크시드⟧';

-- 3) 확인용(선택): 실행 후 아래 두 값이 같아야 한다.
--   select count(*) from public.launch_checklist where seed_tag = '⟦런칭체크시드⟧';
--   select count(*) from public.todos where note like '%⟦런칭시드⟧%';


-- ============================================================================
-- 0088 — 업무투두 런칭 업무 중복의 실제 원인 수정: users 이름 중복
-- 원인: 재삽입 조인 `u.name = person` 이 같은 이름(김려은·박종혁 등) 여러 행과
--       매칭되어 해당 담당자의 업무가 배로 생성됨(브랜드별 업무는 ×2 = 4건).
-- 해결: (a) users 이름 중복을 정리(가장 오래된 1행만 남김, 참조는 유지쪽으로 이관),
--       (b) 런칭 todos 전량 삭제 후 이름당 1명만 매칭해 재삽입.
-- 선행: 0082(launch_checklist + 신규 MD), 0079(구성원 계정). 재실행 안전.
-- ============================================================================

-- (a) users 이름 중복 정리 — 유지 대상(가장 오래된 행)으로 참조 이관 후 중복 삭제
with ranked as (
  select id, name,
         row_number() over (partition by name order by created_at, id) as rn,
         first_value(id) over (partition by name order by created_at, id) as keep_id
  from public.users
), dups as (
  select id, keep_id from ranked where rn > 1
)
-- 참조 이관: todos 단일 담당자
update public.todos t set assignee_user_id = d.keep_id
  from dups d where t.assignee_user_id = d.id;
update public.todos t set created_by = d.keep_id
  from dups d where t.created_by = d.id;
-- 중복 user 삭제
delete from public.users u using (
  select id from public.users x
  where exists (
    select 1 from public.users y
    where y.name = x.name and (y.created_at, y.id) < (x.created_at, x.id)
  )
) dd where u.id = dd.id;

-- (b) 런칭 todos 재정규화(이름당 1명만 매칭 → 정확히 launch_checklist 건수)
delete from public.launch_checklist a using public.launch_checklist b
  where a.ctid > b.ctid and coalesce(a.scope,'')=coalesce(b.scope,'')
    and a.category=b.category and a.item=b.item;

delete from public.todos where note like '%⟦런칭시드⟧%' or title like '[%] %';

insert into public.todos
  (title, brand_id, assignee_user_id, assignee_user_ids, priority, status, due_date, note)
select
  '[' || c.category || '] ' || c.item, c.brand_id, u.id,
  case when u.id is not null then array[u.id] else '{}'::uuid[] end,
  case c.priority when '최우선' then '높음' when '높음' then '높음' else '보통' end,
  '예정', c.due_date,
  '담당 ' || coalesce(nullif(c.owner_role,''),'-')
    || case when coalesce(c.collab,'')<>'' then ' · 협업 '||c.collab else '' end
    || case when coalesce(c.reviewer,'')<>'' then ' · 검수 '||c.reviewer else '' end
    || ' ⟦런칭시드⟧'
from public.launch_checklist c
left join (values
  ('경영지원','박종혁'),('BM','김려은'),('마케터','차민준'),
  ('디자이너','한여정'),('고문','최운호'),('대표이사','서현옥'),('MD','신규 MD')
) as m(role, person) on m.role = c.owner_role
left join (select distinct on (name) name, id from public.users order by name, created_at, id) u
  on u.name = m.person;


-- ============================================================================
-- 0089 — 직원관리(staff_directory) + 연차관리(leave_members)에 실제 구성원 입력
-- 입사일(hire_date)·연차 기산일(join_date)은 전부 2026-08-10로 통일.
-- 연봉·연락처 등은 비워 두고 화면에서 수정 가능. 이름 기준 idempotent.
-- ============================================================================

-- 직원관리 -------------------------------------------------------------------
insert into public.staff_directory (name, position, hire_date, salary, phone, note)
select v.name, v.position, date '2026-08-10', 0, null, null
from (values
  ('서현옥', '대표'),
  ('최운호', '고문'),
  ('김려은', '총괄 BM'),
  ('차민준', '마케터'),
  ('한여정', '디자인·ABM'),
  ('박종혁', '경영지원·마케팅'),
  ('박병헌', '영상 PD'),
  ('허승원', '영상 PD')
) as v(name, position)
where not exists (
  select 1 from public.staff_directory s where s.name = v.name
);

-- 연차관리 -------------------------------------------------------------------
insert into public.leave_members (name, join_date, carryover, note, active)
select v.name, date '2026-08-10', 0, null, true
from (values
  ('서현옥'), ('최운호'), ('김려은'), ('차민준'),
  ('한여정'), ('박종혁'), ('박병헌'), ('허승원')
) as v(name)
where not exists (
  select 1 from public.leave_members m where m.name = v.name
);


-- ============================================================================
-- 0090 — 목표 대시보드 갱신: 브랜드별 월 목표매출 20억, 마케팅 예산 월 5~6억
-- 시드 태그(⟦보드시드⟧) 행만 교체. 사용자가 화면에서 추가한 목표는 유지.
-- ============================================================================

delete from public.revenue_goals where note like '%⟦보드시드⟧%';

insert into public.revenue_goals (scope, metric, value, unit, sort_order, note) values
  ('전사','월 목표매출',      4000000000,'원', 1,'하루바른 20억 + 나아 20억 ⟦보드시드⟧'),
  ('전사','연 목표매출',     48000000000,'원', 2,'브랜드별 월 20억 × 2 × 12개월 ⟦보드시드⟧'),
  ('전사','월 마케팅 예산',   1200000000,'원', 3,'브랜드별 5~6억 합산(상한 기준) ⟦보드시드⟧'),
  ('하루바른','월 목표매출',   2000000000,'원',10,'⟦보드시드⟧'),
  ('하루바른','연 목표매출',  24000000000,'원',11,'월 20억 × 12개월 ⟦보드시드⟧'),
  ('하루바른','월 마케팅 예산',  600000000,'원',12,'월 5억~6억 ⟦보드시드⟧'),
  ('나아','월 목표매출',       2000000000,'원',20,'⟦보드시드⟧'),
  ('나아','연 목표매출',      24000000000,'원',21,'월 20억 × 12개월 ⟦보드시드⟧'),
  ('나아','월 마케팅 예산',      600000000,'원',22,'월 5억~6억 ⟦보드시드⟧');


-- ============================================================================
-- 0091 — 커머스 운영 프레임 도구 연동
-- (1) 이벤트 관리: 명분×기간×수량 3요소 완성을 위한 목표수량 컬럼
-- (2) 제품개발: 제품 채택 8필터 체크 + 원가율/판매가 손익 판정용 컬럼
-- ============================================================================

alter table public.marketing_events
  add column if not exists target_qty int;                          -- 목표(한정) 수량

alter table public.product_developments
  add column if not exists adoption_flags boolean[] not null default '{}'::boolean[];  -- 채택 8필터
alter table public.product_developments
  add column if not exists sell_price bigint;                       -- 판매가(원). 원가율 = cost_estimate / sell_price


-- ============================================================================
-- 0092 — 상위 업무 + 하위 체크리스트 구조
-- 업무투두(todos)·런칭준비(launch_checklist)에 하위 체크리스트(jsonb) 추가.
-- 형식: [{ "text": "항목", "done": false }, ...]
-- ============================================================================

alter table public.todos
  add column if not exists checklist jsonb not null default '[]'::jsonb;

alter table public.launch_checklist
  add column if not exists checklist jsonb not null default '[]'::jsonb;


-- ============================================================================
-- 0093 — 런칭 업무 그룹 정리 (범위·카테고리별 상위 업무 + 하위 체크리스트)
-- launch_checklist를 그룹으로 재구성하고 todos에도 동일 구조로 미러링.
-- 선행: 0082·0092·0079. delete-후-insert 라 재실행 안전.
-- ============================================================================

-- 1) launch_checklist 재구성 --------------------------------------------------
delete from public.launch_checklist where seed_tag = '⟦런칭체크시드⟧';
insert into public.launch_checklist (brand_id, scope, seq, category, item, owner_role, priority, status, note, sort_order, seed_tag, checklist)
select b.id, v.scope, v.seq, v.category, v.item, v.owner, v.priority, '미착수', v.note, v.seq, '⟦런칭체크시드⟧', v.checklist::jsonb
from (values
  ('', '전사', 1, '자금', '법인 간 자금이동 원칙 수립 및 금전소비대차계약 서식 마련', '경영지원', '높음', '무계약 이체는 가지급금·인정이자 과세. VC 실사지적사항. 양 법인 공통 — 한 번만 수행', '[]'),
  ('', '전사', 2, 'IP', '변리사 선임 (상표·특허·디자인 일괄)', '경영지원', '최우선', '수임료 확정은 대표 승인 사항. 양 법인 공통 — 한번만 수행', '[]'),
  ('', '전사', 3, '유통인프라', '3PL 물류업체 선정 및 계약', '경영지원', '최우선', '건기식 로트 추적 + 화장품 유통기한 관리 동시 가능 업체. 양 법인 공통', '[]'),
  ('', '전사', 4, '제조', '제조사 미팅 준비 및 진행 (쿠션·건기식·화장품)', 'BM', '최우선', '소개는 고문·대표. 자료 준비와 진행은 BM. 양 법인 공통', '[]'),
  ('', '전사', 5, '정부지원', '정부지원', '경영지원', '높음', '2개 하위항목 · 담당 경영지원', '[{"text": "기업부설연구소 설립 신고 (KOITA)", "done": false}, {"text": "정부지원 로드맵 수립 — 연구소 → 벤처확인 → 기보 → 팁스 순서", "done": false}]'),
  ('', '전사', 6, '리스크', '톤업 이너뷰티 세트 — 두 법인 간 거래·정산 구조 확정', '경영지원', '높음', '화장품(나아) + 건기식(하루바른) 결합 상품. 판매주체 법인과 매입 방식 결정', '[]'),
  ('hb', '하루바른', 7, '판매자격', '판매자격 셋업', 'BM', '최우선', '8개 하위항목 · 담당 BM', '[{"text": "통신판매업 신고 (관할 구청)", "done": false}, {"text": "4종 품목제조보고 유형 확인 — 건강기능식품 / 일반식품(기타가공품) [한솔 회신]", "done": false}, {"text": "리셀바인(NMN) 식품원료 사용 적법성 확인 — 식품공전 등재 / 한시적 인정 여부", "done": false}, {"text": "영업자 위생교육 이수 (온라인)", "done": false}, {"text": "건강기능식품 일반판매업 신고 (관할 시군구)", "done": false}, {"text": "품목제조보고 완료 확인 및 보고서 사본 수령", "done": false}, {"text": "제품 표시사항(라벨) 최종 검토 — 인쇄 전", "done": false}, {"text": "보부상 건기 공장 완공(27.01)과 남성활력 입고(26.10말) 일정 정합성 확인", "done": false}]'),
  ('hb', '하루바른', 8, '자금', '법인 자금관리 셋업', '경영지원', '최우선', '5개 하위항목 · 담당 경영지원', '[{"text": "사업자 통장 5분할 개설 — 매출수취 / 운영지출 / 매입결제 / 세금유보 / 조달자금", "done": false}, {"text": "신설법인 한도제한계좌 해제 신청", "done": false}, {"text": "세금유보 이체 룰 세팅 — 매출수취 통장에서 월 매출의 20% 자동이체", "done": false}, {"text": "법인카드 발급 및 운영지출 통장 연결", "done": false}, {"text": "4대보험 성립신고", "done": false}]'),
  ('hb', '하루바른', 9, '서류', '서류·품질 패키지', 'BM', '최우선', '6개 하위항목 · 담당 BM', '[{"text": "전성분 발행 요청 및 수령 — 4종", "done": false}, {"text": "자가품질검사(CT) 의뢰 및 성적서 수령 — 4종", "done": false}, {"text": "제조사 서류 취합 ① 원료 근거 (고시형 / 개별인정형 / 일반원료), 배합비", "done": false}, {"text": "제조사 서류 취합 ② 유통기한 설정사유서, 영양성분 분석표", "done": false}, {"text": "제조사 서류 취합 ③ GMP 또는 HACCP 인증서 사본", "done": false}, {"text": "인체적용시험 의뢰 여부 결정 — 4종 중 우선순위 선별", "done": false}]'),
  ('hb', '하루바른', 10, '광고심의', '표시광고 대응', '마케터', '최우선', '3개 하위항목 · 담당 마케터', '[{"text": "4종 소구 재설계 — 탈모·다이어트·항노화·항산화 표현 대체안 확정", "done": false}, {"text": "상세페이지·SNS 문구안 작성 (대체 소구 기준)", "done": false}, {"text": "건기식 표시광고 사전심의 신청 (한국건강기능식품협회)", "done": false}]'),
  ('hb', '하루바른', 11, '런칭전략', '런칭 시나리오 확정·상신 (품목 유형 반영)', 'BM', '일반', '일반식품 단일 트랙 / 건기식 분리 2단계 중 결정', '[]'),
  ('hb', '하루바른', 12, '브랜드', 'BI·도메인·SNS 세팅', '마케터', '최우선', '2개 하위항목 · 담당 마케터', '[{"text": "BI 최종본 확정 (상표 출원용 도형 포함)", "done": false}, {"text": "도메인·SNS 핸들 선점 — 전 채널", "done": false}]'),
  ('hb', '하루바른', 13, '콘텐츠', '콘텐츠 제작 패키지', '디자이너', '최우선', '4개 하위항목 · 담당 디자이너', '[{"text": "패키지 아트웍 최종 (바코드·표시사항 반영) 및 인쇄 발주", "done": false}, {"text": "제품 촬영 (제품컷·연출컷·누끼)", "done": false}, {"text": "상세페이지 디자인 (승인 문구 기준)", "done": false}, {"text": "SNS 계정 개설 및 초기 피드 12컷", "done": false}]'),
  ('hb', '하루바른', 14, '홍보', '런칭 홍보 패키지', '마케터', '일반', '3개 하위항목 · 담당 마케터', '[{"text": "언론보도 배포처 10곳 리스트·견적", "done": false}, {"text": "런칭 보도자료 작성 및 배포", "done": false}, {"text": "브랜드 검색 1페이지 장악 설계 (네이버·구글·인스타)", "done": false}]'),
  ('hb', '하루바른', 15, '유통인프라', '유통 인프라 셋업', 'BM', '최우선', '4개 하위항목 · 담당 BM', '[{"text": "GS1 회원가입 및 표준바코드(GTIN) 발급", "done": false}, {"text": "SKU 코드 체계 확정", "done": false}, {"text": "생산물배상책임보험(PL) 가입", "done": false}, {"text": "반품·CS·교환 규정 문서화", "done": false}]'),
  ('hb', '하루바른', 16, '가격정책', '가격정책 확정', 'MD', '최우선', '3개 하위항목 · 담당 MD', '[{"text": "채널별 마진 역산표 작성 (자사몰/스마트스토어/쿠팡/공구/오프라인)", "done": false}, {"text": "최저가 방어(MAP) 정책 수립", "done": false}, {"text": "4종 채널별 판매가 확정안 상신", "done": false}]'),
  ('hb', '하루바른', 17, '유통', '판매채널 입점', 'MD', '최우선', '3개 하위항목 · 담당 MD', '[{"text": "초도 발주 수량 확정 및 발주서 상신", "done": false}, {"text": "스마트스토어·쿠팡 입점 등록", "done": false}, {"text": "자사몰 오픈 (결제·배송·CS 세팅 포함)", "done": false}]'),
  ('hb', '하루바른', 18, 'IP', '상표·특허·디자인 출원', '경영지원', '최우선', '9개 하위항목 · 담당 경영지원', '[{"text": "상표 선등록 검색 — 회사명 + 4종 제품명 (국내·중국)", "done": false}, {"text": "국내 상표 출원 (우선심사 청구)", "done": false}, {"text": "디자인권 출원 (용기·패키지 형태)", "done": false}, {"text": "중국 상표 직접출원", "done": false}, {"text": "조성물특허 — 한솔 턴키 계약상 처방 권리 귀속 확인", "done": false}, {"text": "저작권 등록 (BI·대표 이미지)", "done": false}, {"text": "조성물특허 출원 (우선심사 청구)", "done": false}, {"text": "미국·일본·동남아 상표 출원 (파리조약 우선권 6개월 내)", "done": false}, {"text": "아마존 Brand Registry 등록", "done": false}]'),
  ('hb', '하루바른', 19, '정부지원', '벤처기업확인 신청', '경영지원', '일반', '연구개발유형 기준', '[]'),
  ('hb', '하루바른', 20, '수출', '수출 인허가·바이어', 'MD', '높음', '4개 하위항목 · 담당 MD', '[{"text": "타겟국 바이어·유통 발굴 — 미국·중국·일본·동남아", "done": false}, {"text": "미국 FDA 식품시설 등록 + US Agent 선임", "done": false}, {"text": "중국 진출 방식 결정안 상신 — 일반무역 / 크로스보더(CBEC)", "done": false}, {"text": "동남아 인허가 대응 — 베트남 공표, 태국 FDA, 인니 BPOM·할랄", "done": false}]'),
  ('na', '나아', 21, '브랜드', 'BI·도메인·SNS 세팅', '마케터', '최우선', '3개 하위항목 · 담당 마케터', '[{"text": "법인·브랜드 표기 확정 — NA:AH / 나아 / 더나아", "done": false}, {"text": "BI 최종본 확정 (상표 출원용 도형 포함)", "done": false}, {"text": "도메인·SNS 핸들 선점 — 전 채널", "done": false}]'),
  ('na', '나아', 22, '판매자격', '판매자격 셋업', '경영지원', '최우선', '7개 하위항목 · 담당 경영지원', '[{"text": "책임판매관리자 채용 공고 게시", "done": false}, {"text": "책임판매관리자 채용 확정 또는 외부 위탁 선임", "done": false}, {"text": "화장품책임판매업 등록 (지방식약청)", "done": false}, {"text": "통신판매업 신고", "done": false}, {"text": "기능성화장품 2종 확정 — 톤업로션(미백), 캡슐자차 선크림(자외선차단)", "done": false}, {"text": "자외선차단지수(SPF/PA) 인체적용시험 의뢰", "done": false}, {"text": "기능성화장품 심사 또는 보고 접수", "done": false}]'),
  ('na', '나아', 23, '자금', '법인 자금관리 셋업', '경영지원', '높음', '5개 하위항목 · 담당 경영지원', '[{"text": "사업자 통장 5분할 개설 — 매출수취 / 운영지출 / 매입결제 / 세금유보 / 조달자금", "done": false}, {"text": "신설법인 한도제한계좌 해제 신청", "done": false}, {"text": "세금유보 이체 룰 세팅 — 매출수취 통장에서 월 매출의 20% 자동이체", "done": false}, {"text": "법인카드 발급 및 운영지출 통장 연결", "done": false}, {"text": "4대보험 성립신고", "done": false}]'),
  ('na', '나아', 24, '제품', '제품 개발·발주', 'BM', '최우선', '6개 하위항목 · 담당 BM', '[{"text": "런칭 차수·종수 확정 — 13종 동시 / 단계 분할 결정", "done": false}, {"text": "바나나팩토리 CGMP / ISO 22716 보유 및 책임판매업 지원 범위 확인", "done": false}, {"text": "바나나팩토리 OEM 계약 체결", "done": false}, {"text": "1차 8종 처방 확정 (진정광크림 샘플 3종 테스트 포함)", "done": false}, {"text": "미정 5종 제조사 선정 — 앰플세럼, 크림, 선크림(CIT), 앰플미스트,마스크팩", "done": false}, {"text": "1차 8종 발주 확정", "done": false}]'),
  ('na', '나아', 25, '서류', '서류·품질 패키지', 'BM', '최우선', '7개 하위항목 · 담당 BM', '[{"text": "1차 8종 안정성시험 착수 (가속·장기)", "done": false}, {"text": "제조사 CGMP / ISO 22716 인증서 확보", "done": false}, {"text": "전성분(INCI), 제품표준서, MSDS, CoA 취합", "done": false}, {"text": "동물실험 미실시 확인서 확보", "done": false}, {"text": "알레르기 유발성분 목록 확정 및 표시 반영", "done": false}, {"text": "1차 8종 미생물·중금속 시험(CT) 의뢰 및 성적서 수령", "done": false}, {"text": "자유판매증명서(CFS) 신청", "done": false}]'),
  ('na', '나아', 26, '광고심의', '표시광고 대응', '마케터', '최우선', '2개 하위항목 · 담당 마케터', '[{"text": "기획 소구 문구 실증 검토 — 4세대 / 모낭속 균 / 바를수록 미백", "done": false}, {"text": "표시광고 실증자료 확보·보관 체계 수립", "done": false}]'),
  ('na', '나아', 27, '리스크', '개발 리스트의 타겟 제품명 표기 정리 (내부 코드로 치환)', 'BM', '높음', '경쟁사 제품명이 시트에 그대로 기재됨. 외부 공유시 카피 프레임·부정경쟁 이슈', '[]'),
  ('na', '나아', 28, '콘텐츠', '콘텐츠 제작 패키지', '디자이너', '높음', '3개 하위항목 · 담당 디자이너', '[{"text": "1차 8종 패키지 디자인·아트웍 (바코드·표시사항 반영)", "done": false}, {"text": "1차 8종 제품 촬영 및 상세페이지 제작", "done": false}, {"text": "SNS 계정 개설 및 초기 피드", "done": false}]'),
  ('na', '나아', 29, '홍보', '런칭 홍보 패키지', '마케터', '일반', '2개 하위항목 · 담당 마케터', '[{"text": "언론보도 배포처 리스트·견적", "done": false}, {"text": "런칭 보도자료 작성 및 배포", "done": false}]'),
  ('na', '나아', 30, '유통인프라', '유통 인프라 셋업', 'BM', '최우선', '5개 하위항목 · 담당 BM', '[{"text": "GS1 회원가입 및 표준바코드(GTIN) 발급", "done": false}, {"text": "SKU 코드 체계 확정", "done": false}, {"text": "완제품 입고 전 3PL 업체 세팅 완료", "done": false}, {"text": "생산물배상책임보험(PL) 가입", "done": false}, {"text": "반품·CS·교환 규정 문서화", "done": false}]'),
  ('na', '나아', 31, '가격정책', '가격정책 확정', 'MD', '높음', '2개 하위항목 · 담당 MD', '[{"text": "채널별 마진 역산표 작성 (자사몰/올영/쿠팡/공구/오프라인)", "done": false}, {"text": "1차 8종 채널별 가격 정책 확정안 상신", "done": false}]'),
  ('na', '나아', 32, '유통', '판매채널 입점', 'MD', '높음', '3개 하위항목 · 담당 MD', '[{"text": "올리브영 입점 제안서 작성 및 상신", "done": false}, {"text": "자사몰 구축", "done": false}, {"text": "온라인 채널 입점 등록 (스마트스토어·쿠팡·무신사 등)", "done": false}]'),
  ('na', '나아', 33, 'IP', '상표·특허·디자인 출원', '경영지원', '최우선', '7개 하위항목 · 담당 경영지원', '[{"text": "상표 선등록 검색 — 회사명 + 제품명 (국내·중국)", "done": false}, {"text": "국내 상표 출원 (우선심사 청구)", "done": false}, {"text": "중국 상표 직접출원", "done": false}, {"text": "저작권 등록 (BI·대표 이미지)", "done": false}, {"text": "디자인권 출원 (용기·패키지 형태)", "done": false}, {"text": "미국·일본·동남아 상표 출원 (파리조약 우선권 6개월 내)", "done": false}, {"text": "아마존 Brand Registry 등록", "done": false}]'),
  ('na', '나아', 34, '정부지원', '벤처기업확인 신청', '경영지원', '일반', '연구개발유형 기준', '[]'),
  ('na', '나아', 35, '수출', '수출 인허가·바이어', 'MD', '높음', '5개 하위항목 · 담당 MD', '[{"text": "타겟국 바이어·유통 발굴 — 미국·중국·일본·동남아", "done": false}, {"text": "미국 MoCRA 대응 — US Agent 선임, 제품 리스팅", "done": false}, {"text": "중국 진출 방식 결정안 상신 — NMPA 비안 / 크로스보더(CBEC)", "done": false}, {"text": "일본 화장품 제조판매업 파트너 발굴", "done": false}, {"text": "동남아 인허가 대응 — 인니 BPOM·할랄, 베트남 공표, 태국 FDA", "done": false}]')
) as v(slug, scope, seq, category, item, owner, priority, note, checklist)
left join public.brands b on nullif(v.slug,'') = b.slug;

-- 2) todos 재구성(그룹 반영) ---------------------------------------------------
delete from public.todos where note like '%⟦런칭시드⟧%' or title like '[%] %';
insert into public.todos (title, brand_id, assignee_user_id, assignee_user_ids, priority, status, due_date, note, checklist)
select v.title, b.id, u.id, case when u.id is not null then array[u.id] else '{}'::uuid[] end, v.priority, '예정', nullif(v.due,'')::date, v.note, v.checklist::jsonb
from (values
  ('[자금] 법인 간 자금이동 원칙 수립 및 금전소비대차계약 서식 마련', '', '박종혁', '높음', '2026-09-05', '담당 경영지원 ⟦런칭시드⟧', '[]'),
  ('[IP] 변리사 선임 (상표·특허·디자인 일괄)', '', '박종혁', '높음', '2026-08-18', '담당 경영지원 ⟦런칭시드⟧', '[]'),
  ('[유통인프라] 3PL 물류업체 선정 및 계약', '', '박종혁', '높음', '2026-08-22', '담당 경영지원 ⟦런칭시드⟧', '[]'),
  ('[제조] 제조사 미팅 준비 및 진행 (쿠션·건기식·화장품)', '', '김려은', '높음', '2026-08-22', '담당 BM ⟦런칭시드⟧', '[]'),
  ('[정부지원] 정부지원', '', '박종혁', '높음', '2026-09-15', '담당 경영지원 · 2개 하위항목 ⟦런칭시드⟧', '[{"text": "기업부설연구소 설립 신고 (KOITA)", "done": false}, {"text": "정부지원 로드맵 수립 — 연구소 → 벤처확인 → 기보 → 팁스 순서", "done": false}]'),
  ('[리스크] 톤업 이너뷰티 세트 — 두 법인 간 거래·정산 구조 확정', '', '박종혁', '높음', '2026-09-30', '담당 경영지원 ⟦런칭시드⟧', '[]'),
  ('[판매자격] 판매자격 셋업', 'hb', '김려은', '높음', '2026-08-16', '담당 BM · 8개 하위항목 ⟦런칭시드⟧', '[{"text": "통신판매업 신고 (관할 구청)", "done": false}, {"text": "4종 품목제조보고 유형 확인 — 건강기능식품 / 일반식품(기타가공품) [한솔 회신]", "done": false}, {"text": "리셀바인(NMN) 식품원료 사용 적법성 확인 — 식품공전 등재 / 한시적 인정 여부", "done": false}, {"text": "영업자 위생교육 이수 (온라인)", "done": false}, {"text": "건강기능식품 일반판매업 신고 (관할 시군구)", "done": false}, {"text": "품목제조보고 완료 확인 및 보고서 사본 수령", "done": false}, {"text": "제품 표시사항(라벨) 최종 검토 — 인쇄 전", "done": false}, {"text": "보부상 건기 공장 완공(27.01)과 남성활력 입고(26.10말) 일정 정합성 확인", "done": false}]'),
  ('[자금] 법인 자금관리 셋업', 'hb', '박종혁', '높음', '2026-08-21', '담당 경영지원 · 5개 하위항목 ⟦런칭시드⟧', '[{"text": "사업자 통장 5분할 개설 — 매출수취 / 운영지출 / 매입결제 / 세금유보 / 조달자금", "done": false}, {"text": "신설법인 한도제한계좌 해제 신청", "done": false}, {"text": "세금유보 이체 룰 세팅 — 매출수취 통장에서 월 매출의 20% 자동이체", "done": false}, {"text": "법인카드 발급 및 운영지출 통장 연결", "done": false}, {"text": "4대보험 성립신고", "done": false}]'),
  ('[서류] 서류·품질 패키지', 'hb', '김려은', '높음', '2026-08-18', '담당 BM · 6개 하위항목 ⟦런칭시드⟧', '[{"text": "전성분 발행 요청 및 수령 — 4종", "done": false}, {"text": "자가품질검사(CT) 의뢰 및 성적서 수령 — 4종", "done": false}, {"text": "제조사 서류 취합 ① 원료 근거 (고시형 / 개별인정형 / 일반원료), 배합비", "done": false}, {"text": "제조사 서류 취합 ② 유통기한 설정사유서, 영양성분 분석표", "done": false}, {"text": "제조사 서류 취합 ③ GMP 또는 HACCP 인증서 사본", "done": false}, {"text": "인체적용시험 의뢰 여부 결정 — 4종 중 우선순위 선별", "done": false}]'),
  ('[광고심의] 표시광고 대응', 'hb', '차민준', '높음', '2026-08-18', '담당 마케터 · 3개 하위항목 ⟦런칭시드⟧', '[{"text": "4종 소구 재설계 — 탈모·다이어트·항노화·항산화 표현 대체안 확정", "done": false}, {"text": "상세페이지·SNS 문구안 작성 (대체 소구 기준)", "done": false}, {"text": "건기식 표시광고 사전심의 신청 (한국건강기능식품협회)", "done": false}]'),
  ('[런칭전략] 런칭 시나리오 확정·상신 (품목 유형 반영)', 'hb', '김려은', '보통', '2026-08-18', '담당 BM ⟦런칭시드⟧', '[]'),
  ('[브랜드] BI·도메인·SNS 세팅', 'hb', '차민준', '높음', '2026-08-17', '담당 마케터 · 2개 하위항목 ⟦런칭시드⟧', '[{"text": "BI 최종본 확정 (상표 출원용 도형 포함)", "done": false}, {"text": "도메인·SNS 핸들 선점 — 전 채널", "done": false}]'),
  ('[콘텐츠] 콘텐츠 제작 패키지', 'hb', '한여정', '높음', '2026-08-18', '담당 디자이너 · 4개 하위항목 ⟦런칭시드⟧', '[{"text": "패키지 아트웍 최종 (바코드·표시사항 반영) 및 인쇄 발주", "done": false}, {"text": "제품 촬영 (제품컷·연출컷·누끼)", "done": false}, {"text": "상세페이지 디자인 (승인 문구 기준)", "done": false}, {"text": "SNS 계정 개설 및 초기 피드 12컷", "done": false}]'),
  ('[홍보] 런칭 홍보 패키지', 'hb', '차민준', '보통', '2026-08-24', '담당 마케터 · 3개 하위항목 ⟦런칭시드⟧', '[{"text": "언론보도 배포처 10곳 리스트·견적", "done": false}, {"text": "런칭 보도자료 작성 및 배포", "done": false}, {"text": "브랜드 검색 1페이지 장악 설계 (네이버·구글·인스타)", "done": false}]'),
  ('[유통인프라] 유통 인프라 셋업', 'hb', '김려은', '높음', '2026-08-18', '담당 BM · 4개 하위항목 ⟦런칭시드⟧', '[{"text": "GS1 회원가입 및 표준바코드(GTIN) 발급", "done": false}, {"text": "SKU 코드 체계 확정", "done": false}, {"text": "생산물배상책임보험(PL) 가입", "done": false}, {"text": "반품·CS·교환 규정 문서화", "done": false}]'),
  ('[가격정책] 가격정책 확정', 'hb', '신규 MD', '높음', '2026-08-20', '담당 MD · 3개 하위항목 ⟦런칭시드⟧', '[{"text": "채널별 마진 역산표 작성 (자사몰/스마트스토어/쿠팡/공구/오프라인)", "done": false}, {"text": "최저가 방어(MAP) 정책 수립", "done": false}, {"text": "4종 채널별 판매가 확정안 상신", "done": false}]'),
  ('[유통] 판매채널 입점', 'hb', '신규 MD', '높음', '2026-08-18', '담당 MD · 3개 하위항목 ⟦런칭시드⟧', '[{"text": "초도 발주 수량 확정 및 발주서 상신", "done": false}, {"text": "스마트스토어·쿠팡 입점 등록", "done": false}, {"text": "자사몰 오픈 (결제·배송·CS 세팅 포함)", "done": false}]'),
  ('[IP] 상표·특허·디자인 출원', 'hb', '박종혁', '높음', '2026-08-18', '담당 경영지원 · 9개 하위항목 ⟦런칭시드⟧', '[{"text": "상표 선등록 검색 — 회사명 + 4종 제품명 (국내·중국)", "done": false}, {"text": "국내 상표 출원 (우선심사 청구)", "done": false}, {"text": "디자인권 출원 (용기·패키지 형태)", "done": false}, {"text": "중국 상표 직접출원", "done": false}, {"text": "조성물특허 — 한솔 턴키 계약상 처방 권리 귀속 확인", "done": false}, {"text": "저작권 등록 (BI·대표 이미지)", "done": false}, {"text": "조성물특허 출원 (우선심사 청구)", "done": false}, {"text": "미국·일본·동남아 상표 출원 (파리조약 우선권 6개월 내)", "done": false}, {"text": "아마존 Brand Registry 등록", "done": false}]'),
  ('[정부지원] 벤처기업확인 신청', 'hb', '박종혁', '보통', '2026-12-31', '담당 경영지원 ⟦런칭시드⟧', '[]'),
  ('[수출] 수출 인허가·바이어', 'hb', '신규 MD', '높음', '', '담당 MD · 4개 하위항목 ⟦런칭시드⟧', '[{"text": "타겟국 바이어·유통 발굴 — 미국·중국·일본·동남아", "done": false}, {"text": "미국 FDA 식품시설 등록 + US Agent 선임", "done": false}, {"text": "중국 진출 방식 결정안 상신 — 일반무역 / 크로스보더(CBEC)", "done": false}, {"text": "동남아 인허가 대응 — 베트남 공표, 태국 FDA, 인니 BPOM·할랄", "done": false}]'),
  ('[브랜드] BI·도메인·SNS 세팅', 'na', '차민준', '높음', '2026-08-20', '담당 마케터 · 3개 하위항목 ⟦런칭시드⟧', '[{"text": "법인·브랜드 표기 확정 — NA:AH / 나아 / 더나아", "done": false}, {"text": "BI 최종본 확정 (상표 출원용 도형 포함)", "done": false}, {"text": "도메인·SNS 핸들 선점 — 전 채널", "done": false}]'),
  ('[판매자격] 판매자격 셋업', 'na', '박종혁', '높음', '2026-08-22', '담당 경영지원 · 7개 하위항목 ⟦런칭시드⟧', '[{"text": "책임판매관리자 채용 공고 게시", "done": false}, {"text": "책임판매관리자 채용 확정 또는 외부 위탁 선임", "done": false}, {"text": "화장품책임판매업 등록 (지방식약청)", "done": false}, {"text": "통신판매업 신고", "done": false}, {"text": "기능성화장품 2종 확정 — 톤업로션(미백), 캡슐자차 선크림(자외선차단)", "done": false}, {"text": "자외선차단지수(SPF/PA) 인체적용시험 의뢰", "done": false}, {"text": "기능성화장품 심사 또는 보고 접수", "done": false}]'),
  ('[자금] 법인 자금관리 셋업', 'na', '박종혁', '높음', '2026-09-10', '담당 경영지원 · 5개 하위항목 ⟦런칭시드⟧', '[{"text": "사업자 통장 5분할 개설 — 매출수취 / 운영지출 / 매입결제 / 세금유보 / 조달자금", "done": false}, {"text": "신설법인 한도제한계좌 해제 신청", "done": false}, {"text": "세금유보 이체 룰 세팅 — 매출수취 통장에서 월 매출의 20% 자동이체", "done": false}, {"text": "법인카드 발급 및 운영지출 통장 연결", "done": false}, {"text": "4대보험 성립신고", "done": false}]'),
  ('[제품] 제품 개발·발주', 'na', '김려은', '높음', '2026-08-22', '담당 BM · 6개 하위항목 ⟦런칭시드⟧', '[{"text": "런칭 차수·종수 확정 — 13종 동시 / 단계 분할 결정", "done": false}, {"text": "바나나팩토리 CGMP / ISO 22716 보유 및 책임판매업 지원 범위 확인", "done": false}, {"text": "바나나팩토리 OEM 계약 체결", "done": false}, {"text": "1차 8종 처방 확정 (진정광크림 샘플 3종 테스트 포함)", "done": false}, {"text": "미정 5종 제조사 선정 — 앰플세럼, 크림, 선크림(CIT), 앰플미스트,마스크팩", "done": false}, {"text": "1차 8종 발주 확정", "done": false}]'),
  ('[서류] 서류·품질 패키지', 'na', '김려은', '높음', '2026-09-20', '담당 BM · 7개 하위항목 ⟦런칭시드⟧', '[{"text": "1차 8종 안정성시험 착수 (가속·장기)", "done": false}, {"text": "제조사 CGMP / ISO 22716 인증서 확보", "done": false}, {"text": "전성분(INCI), 제품표준서, MSDS, CoA 취합", "done": false}, {"text": "동물실험 미실시 확인서 확보", "done": false}, {"text": "알레르기 유발성분 목록 확정 및 표시 반영", "done": false}, {"text": "1차 8종 미생물·중금속 시험(CT) 의뢰 및 성적서 수령", "done": false}, {"text": "자유판매증명서(CFS) 신청", "done": false}]'),
  ('[광고심의] 표시광고 대응', 'na', '차민준', '높음', '2026-08-25', '담당 마케터 · 2개 하위항목 ⟦런칭시드⟧', '[{"text": "기획 소구 문구 실증 검토 — 4세대 / 모낭속 균 / 바를수록 미백", "done": false}, {"text": "표시광고 실증자료 확보·보관 체계 수립", "done": false}]'),
  ('[리스크] 개발 리스트의 타겟 제품명 표기 정리 (내부 코드로 치환)', 'na', '김려은', '높음', '2026-08-22', '담당 BM ⟦런칭시드⟧', '[]'),
  ('[콘텐츠] 콘텐츠 제작 패키지', 'na', '한여정', '높음', '2026-12-15', '담당 디자이너 · 3개 하위항목 ⟦런칭시드⟧', '[{"text": "1차 8종 패키지 디자인·아트웍 (바코드·표시사항 반영)", "done": false}, {"text": "1차 8종 제품 촬영 및 상세페이지 제작", "done": false}, {"text": "SNS 계정 개설 및 초기 피드", "done": false}]'),
  ('[홍보] 런칭 홍보 패키지', 'na', '차민준', '보통', '2027-02-15', '담당 마케터 · 2개 하위항목 ⟦런칭시드⟧', '[{"text": "언론보도 배포처 리스트·견적", "done": false}, {"text": "런칭 보도자료 작성 및 배포", "done": false}]'),
  ('[유통인프라] 유통 인프라 셋업', 'na', '김려은', '높음', '2026-09-30', '담당 BM · 5개 하위항목 ⟦런칭시드⟧', '[{"text": "GS1 회원가입 및 표준바코드(GTIN) 발급", "done": false}, {"text": "SKU 코드 체계 확정", "done": false}, {"text": "완제품 입고 전 3PL 업체 세팅 완료", "done": false}, {"text": "생산물배상책임보험(PL) 가입", "done": false}, {"text": "반품·CS·교환 규정 문서화", "done": false}]'),
  ('[가격정책] 가격정책 확정', 'na', '신규 MD', '높음', '2026-09-30', '담당 MD · 2개 하위항목 ⟦런칭시드⟧', '[{"text": "채널별 마진 역산표 작성 (자사몰/올영/쿠팡/공구/오프라인)", "done": false}, {"text": "1차 8종 채널별 가격 정책 확정안 상신", "done": false}]'),
  ('[유통] 판매채널 입점', 'na', '신규 MD', '높음', '2026-12-01', '담당 MD · 3개 하위항목 ⟦런칭시드⟧', '[{"text": "올리브영 입점 제안서 작성 및 상신", "done": false}, {"text": "자사몰 구축", "done": false}, {"text": "온라인 채널 입점 등록 (스마트스토어·쿠팡·무신사 등)", "done": false}]'),
  ('[IP] 상표·특허·디자인 출원', 'na', '박종혁', '높음', '2026-08-25', '담당 경영지원 · 7개 하위항목 ⟦런칭시드⟧', '[{"text": "상표 선등록 검색 — 회사명 + 제품명 (국내·중국)", "done": false}, {"text": "국내 상표 출원 (우선심사 청구)", "done": false}, {"text": "중국 상표 직접출원", "done": false}, {"text": "저작권 등록 (BI·대표 이미지)", "done": false}, {"text": "디자인권 출원 (용기·패키지 형태)", "done": false}, {"text": "미국·일본·동남아 상표 출원 (파리조약 우선권 6개월 내)", "done": false}, {"text": "아마존 Brand Registry 등록", "done": false}]'),
  ('[정부지원] 벤처기업확인 신청', 'na', '박종혁', '보통', '2027-03-31', '담당 경영지원 ⟦런칭시드⟧', '[]'),
  ('[수출] 수출 인허가·바이어', 'na', '신규 MD', '높음', '', '담당 MD · 5개 하위항목 ⟦런칭시드⟧', '[{"text": "타겟국 바이어·유통 발굴 — 미국·중국·일본·동남아", "done": false}, {"text": "미국 MoCRA 대응 — US Agent 선임, 제품 리스팅", "done": false}, {"text": "중국 진출 방식 결정안 상신 — NMPA 비안 / 크로스보더(CBEC)", "done": false}, {"text": "일본 화장품 제조판매업 파트너 발굴", "done": false}, {"text": "동남아 인허가 대응 — 인니 BPOM·할랄, 베트남 공표, 태국 FDA", "done": false}]')
) as v(title, slug, person, priority, due, note, checklist)
left join public.brands b on nullif(v.slug,'') = b.slug
left join (select distinct on (name) name, id from public.users order by name, created_at, id) u on u.name = v.person;


-- ============================================================================
-- 0094 — 플랫폼 전체 백업/되돌리기
-- ============================================================================

create table if not exists public.platform_backups (
  id          uuid primary key default gen_random_uuid(),
  label       text,
  kind        text not null default 'manual',       -- manual / auto / pre-restore
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  summary     jsonb not null default '{}'::jsonb,
  data        jsonb not null default '{}'::jsonb
);
create index if not exists platform_backups_created_idx on public.platform_backups(created_at desc);

alter table public.platform_backups enable row level security;
drop policy if exists platform_backups_owner on public.platform_backups;
create policy platform_backups_owner on public.platform_backups for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
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
