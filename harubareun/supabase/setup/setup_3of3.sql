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
-- 0080 — 런칭 준비/판매 To-do 시드 (하루바른·나아). 업무투두로 적재.
--   원자료: 런칭 체크리스트/판매플랜 PDF. 재실행 안전(시드 태그로 교체).
-- ============================================================================

delete from public.todos where note like '%⟦런칭시드⟧%';

insert into public.todos (title, brand_id, priority, status, due_date, note)
select v.title, b.id, v.priority, '예정', v.due, v.note
from (values
  ('[자금] 법인 간 자금이동 원칙 수립 및 금전소비대차계약 서식 마련','','높음',date '2026-09-05','담당 경영지원·대표이사 · 무계약 이체는 가지급금·인정이자 과세. VC 실사 지적사항. 양 법인 공통 — 한 번만 수행 · ⟦런칭시드⟧'),
  ('[IP] 변리사 선임 (상표·특허·디자인 일괄)','','높음',date '2026-08-18','담당 경영지원·대표이사 · 우선순위 최우선 · 수임료 확정은 대표 승인 사항. 양 법인 공통 — 한 번만 수행 · ⟦런칭시드⟧'),
  ('[유통인프라] 3PL 물류업체 선정 및 계약','','높음',date '2026-08-22','담당 경영지원·MD·대표이사 · 우선순위 최우선 · 건기식 로트 추적 + 화장품 유통기한 관리 동시 가 능 업체. 양 법인 공통 · ⟦런칭시드⟧'),
  ('[제조] 제조사 미팅 준비 및 진행 (쿠션·건기식·화장품)','','높음',date '2026-08-22','담당 BM·MD·고문 · 우선순위 최우선 · 소개는 고문·대표. 자료 준비와 진행은 BM. 양 법 인 공통 · ⟦런칭시드⟧'),
  ('[정부지원] 기업부설연구소 설립 신고 (KOITA)','','높음',date '2026-10-31','담당 경영지원·BM·고문 · 선행: 연구전담요원 확보 · 벤처확인·세액공제·팁스의 공통 선행조건. 법인별 각각 필요 · ⟦런칭시드⟧'),
  ('[정부지원] 정부지원 로드맵 수립 — 연구소 → 벤처확인 → 기보 → 팁스 순서','','보통',date '2026-09-15','담당 경영지원·BM·고문 · 팁스는 운영사 추천이 병목. 인증보다 운영사 컨택 이 선행. 양 법인 공통 · ⟦런칭시드⟧'),
  ('[리스크] 톤업 이너뷰티 세트 — 두 법인 간 거래·정산 구조 확정','','높음',date '2026-09-30','담당 경영지원·BM·대표이사 · 화장품(나아) + 건기식(하루바른) 결합 상품. 판매 주체 법인과 매입 방식 결정 · ⟦런칭시드⟧'),
  ('[판매자격] 통신판매업 신고 (관할 구청)','hb','높음',date '2026-08-20','담당 경영지원 · 우선순위 최우선 · 선행: 사업자등록증, 구매안전서 비스 이용확인증 · 에스크로 확인증이 선행. 은행 인터넷뱅킹에서 발 급 · ⟦런칭시드⟧'),
  ('[자금] 사업자 통장 5분할 개설 — 매출수취 / 운영지출 / 매입결제 / 세금유 보 / 조달자금','hb','높음',date '2026-08-21','담당 경영지원·대표이사 · 우선순위 최우선 · 선행: 법인 통장 개설 · 은행은 주거래 1곳으로 집중 · ⟦런칭시드⟧'),
  ('[자금] 신설법인 한도제한계좌 해제 신청','hb','높음',date '2026-08-25','담당 경영지원 · 우선순위 최우선 · 선행: 통장 개설 · 해제 전에는 이체한도가 낮아 실무 불가. 계약서· 매출증빙 지참 · ⟦런칭시드⟧'),
  ('[자금] 세금유보 이체 룰 세팅 — 매출수취 통장에서 월 매출의 20% 자동이 체','hb','높음',date '2026-08-28','담당 경영지원·대표이사 · 선행: 통장 5분할 · 부가세·법인세·원천세·퇴직충당 재원 · ⟦런칭시드⟧'),
  ('[자금] 법인카드 발급 및 운영지출 통장 연결','hb','높음',date '2026-08-28','담당 경영지원 · 선행: 통장 5분할 · ⟦런칭시드⟧'),
  ('[자금] 4대보험 성립신고','hb','높음',date '2026-08-31','담당 경영지원 · ⟦런칭시드⟧'),
  ('[판매자격] 4종 품목제조보고 유형 확인 — 건강기능식품 / 일반식품(기타가공 품) [한솔 회신]','hb','높음',date '2026-08-16','담당 BM·고문 · 우선순위 최우선 · 선행: 제조사 회신 · 생산리스트상 기능성 신고 4종 전부 미체크. 일반 식품 유력. 전체 규제 근거의 기점 · ⟦런칭시드⟧'),
  ('[판매자격] 리셀바인(NMN) 식품원료 사용 적법성 확인 — 식품공전 등재 / 한시 적 인정 여부','hb','높음',date '2026-08-17','담당 BM·고문 · 우선순위 최우선 · 선행: 제조사 회신 · NMN은 건기식 원료 미인정. 한시적 인정이면 신 청자에게만 효력이라 사용 불가할 수 있음 · ⟦런칭시드⟧'),
  ('[판매자격] 영업자 위생교육 이수 (온라인)','hb','높음',date '2026-08-17','담당 경영지원 · 우선순위 최우선 · 판매업 신고의 선행조건 · ⟦런칭시드⟧'),
  ('[판매자격] 건강기능식품 일반판매업 신고 (관할 시군구)','hb','높음',date '2026-08-19','담당 경영지원 · 우선순위 최우선 · 선행: 위생교육 이수, 품목 유형 확 정 · 4종 전부 일반식품이면 해당없음. 향후 건기식 취 급 대비해 선제 신고 권장 · ⟦런칭시드⟧'),
  ('[판매자격] 품목제조보고 완료 확인 및 보고서 사본 수령','hb','높음',date '2026-08-18','담당 BM · 우선순위 최우선 · 제조사가 안 했으면 출고 자체가 불법 · ⟦런칭시드⟧'),
  ('[판매자격] 제품 표시사항(라벨) 최종 검토 — 인쇄 전','hb','높음',date '2026-08-18','담당 BM·디자이너·고문 · 우선순위 최우선 · 선행: 전성분 발행, 품목제조보고 · 전성분 미발행 상태의 문안 검수는 최종본이 아님. 재인쇄 위험 · ⟦런칭시드⟧'),
  ('[판매자격] 보부상 건기 공장 완공(27.01)과 남성활력 입고(26.10말) 일정 정합 성 확인','hb','높음',date '2026-08-22','담당 BM · 선행: 제조사 회신 · 공장 완공 전 생산 불가. 일정 모순 해소 필요 · ⟦런칭시드⟧'),
  ('[서류] 전성분 발행 요청 및 수령 — 4종','hb','높음',date '2026-08-18','담당 BM · 우선순위 최우선 · 생산리스트 미체크. 표시사항·상세페이지·PL보험· 입점서류 전부의 선행조건 · ⟦런칭시드⟧'),
  ('[서류] 자가품질검사(CT) 의뢰 및 성적서 수령 — 4종','hb','높음',date '2026-08-20','담당 BM · 우선순위 최우선 · 생산리스트상 CT 요청·완료 모두 미체크 · ⟦런칭시드⟧'),
  ('[서류] 제조사 서류 취합 ① 원료 근거 (고시형 / 개별인정형 / 일반원료), 배 합비','hb','높음',date '2026-08-18','담당 BM·고문 · 우선순위 최우선 · 개별인정형이면 사용 권한이 원료사에게만 있는지 확인 · ⟦런칭시드⟧'),
  ('[서류] 제조사 서류 취합 ② 유통기한 설정사유서, 영양성분 분석표','hb','높음',date '2026-08-18','담당 BM · 우선순위 최우선 · ⟦런칭시드⟧'),
  ('[서류] 제조사 서류 취합 ③ GMP 또는 HACCP 인증서 사본','hb','높음',date '2026-08-18','담당 BM · 우선순위 최우선 · 건기식이면 GMP 의무. 일반식품이면 HACCP · ⟦런칭시드⟧'),
  ('[서류] 인체적용시험 의뢰 여부 결정 — 4종 중 우선순위 선별','hb','높음',date '2026-08-31','담당 BM·마케터·대표이사 · 선행: 품목 유형 확정 · 일반식품은 임상 없이는 효능 소구 근거가 전무. 개 별인정형·조성물특허의 기초자료 · ⟦런칭시드⟧'),
  ('[광고심의] 4종 소구 재설계 — 탈모·다이어트·항노화·항산화 표현 대체안 확정','hb','높음',date '2026-08-18','담당 마케터·BM·고문 · 우선순위 최우선 · 선행: 품목 유형 확정 · 일반식품은 해당 표현 전부 사용 불가. 제품명은 문 제없으나 카테고리·상세페이지가 위반 · ⟦런칭시드⟧'),
  ('[런칭전략] 런칭 시나리오 확정·상신 (품목 유형 반영) BM 마케터, MD','hb','높음',date '2026-08-18','담당 대표이사 · 우선순위 최우선 · 선행: 품목 유형 확정 · 일반식품 단일 트랙 / 건기식 분리 2단계 중 결정 · ⟦런칭시드⟧'),
  ('[광고심의] 상세페이지·SNS 문구안 작성 (대체 소구 기준)','hb','높음',date '2026-08-20','담당 마케터·BM·고문 · 우선순위 최우선 · 선행: 소구 재설계 · ⟦런칭시드⟧'),
  ('[광고심의] 건기식 표시광고 사전심의 신청 (한국건강기능식품협회)','hb','높음',date '2026-08-20','담당 마케터·BM·고문 · 선행: 건기식 품목 확정 시에만 해 당 · 일반식품이면 해당없음. 건기식 품목이 있으면 통 상 15일 내외로 8/27 불가 · ⟦런칭시드⟧'),
  ('[브랜드] BI 최종본 확정 (상표 출원용 도형 포함)','hb','높음',date '2026-08-18','담당 디자이너·마케터·대표이사 · 우선순위 최우선 · 상표 출원과 패키지 인쇄의 선행조건 · ⟦런칭시드⟧'),
  ('[브랜드] 도메인·SNS 핸들 선점 — 전 채널','hb','높음',date '2026-08-17','담당 마케터 · 우선순위 최우선 · 선행: 브랜드명 확정 · 상표 출원과 동시에. 순서가 벌어지면 선점당함 · ⟦런칭시드⟧'),
  ('[콘텐츠] 패키지 아트웍 최종 (바코드·표시사항 반영) 및 인쇄 발주','hb','높음',date '2026-08-18','담당 디자이너·BM·대표이사 · 우선순위 최우선 · 선행: GS1 바코드, 표시사항 확정 · 인쇄 발주 금액은 대표 승인 후 · ⟦런칭시드⟧'),
  ('[콘텐츠] 제품 촬영 (제품컷·연출컷·누끼)','hb','높음',date '2026-08-20','담당 디자이너·마케터 · 선행: 패키지 실물 입고 · ⟦런칭시드⟧'),
  ('[콘텐츠] 상세페이지 디자인 (승인 문구 기준)','hb','높음',date '2026-08-22','담당 디자이너·마케터·고문 · 선행: 문구안 확정 · ⟦런칭시드⟧'),
  ('[콘텐츠] SNS 계정 개설 및 초기 피드 12컷','hb','보통',date '2026-08-25','담당 마케터·디자이너 · ⟦런칭시드⟧'),
  ('[홍보] 언론보도 배포처 10곳 리스트·견적','hb','보통',date '2026-08-24','담당 마케터·대표이사 · 전재 매체 비중 확인. 검색 인덱싱 목적임을 전제 · ⟦런칭시드⟧'),
  ('[홍보] 런칭 보도자료 작성 및 배포','hb','보통',date '2026-08-27','담당 마케터·대표이사 · 선행: 런칭 시나리오 확정 · 대외 발송이므로 대표 승인 후 배포 · ⟦런칭시드⟧'),
  ('[홍보] 브랜드 검색 1페이지 장악 설계 (네이버·구글·인스타)','hb','보통',date '2026-09-10','담당 마케터·디자이너 · ⟦런칭시드⟧'),
  ('[유통인프라] GS1 회원가입 및 표준바코드(GTIN) 발급','hb','높음',date '2026-08-18','담당 BM·디자이너 · 우선순위 최우선 · 패키지 인쇄의 선행조건. 지연 시 런칭 전체가 밀림 · ⟦런칭시드⟧'),
  ('[유통인프라] SKU 코드 체계 확정','hb','높음',date '2026-08-18','담당 BM·MD · ⟦런칭시드⟧'),
  ('[유통인프라] 생산물배상책임보험(PL) 가입','hb','높음',date '2026-08-25','담당 경영지원 · 우선순위 최우선 · 선행: 전성분, CT 성적서 · 올리브영·쿠팡·대형마트 입점 요구 서류 · ⟦런칭시드⟧'),
  ('[유통인프라] 반품·CS·교환 규정 문서화','hb','높음',date '2026-08-24','담당 BM·경영지원·대표이사 · ⟦런칭시드⟧'),
  ('[가격정책] 채널별 마진 역산표 작성 (자사몰/스마트스토어/쿠팡/공구/오프라 인)','hb','높음',date '2026-08-20','담당 MD·경영지원 · 우선순위 최우선 · 소비자가 역산. 런칭 후에는 못 고침 · ⟦런칭시드⟧'),
  ('[가격정책] 최저가 방어(MAP) 정책 수립','hb','높음',date '2026-08-22','담당 MD·대표이사 · 선행: 마진 역산표 · ⟦런칭시드⟧'),
  ('[가격정책] 4종 채널별 판매가 확정안 상신','hb','높음',date '2026-08-20','담당 MD·경영지원·대표이사 · 우선순위 최우선 · 선행: 마진 역산표 · 금액 최종 확정은 대표 승인 사항 · ⟦런칭시드⟧'),
  ('[유통] 초도 발주 수량 확정 및 발주서 상신','hb','높음',date '2026-08-18','담당 MD·BM·대표이사 · 우선순위 최우선 · 선행: 판매가 승인 · 4종 SKU별 수량. 발주서 발송은 대표 승인 후 · ⟦런칭시드⟧'),
  ('[유통] 스마트스토어·쿠팡 입점 등록','hb','높음',date '2026-08-22','담당 MD · 선행: 통신판매업 신고, 품목 유형 확정 · 건기식 카테고리는 신고증 첨부 필수 · ⟦런칭시드⟧'),
  ('[유통] 자사몰 오픈 (결제·배송·CS 세팅 포함)','hb','높음',date '2026-08-25','담당 MD·디자이너 · 우선순위 최우선 · 선행: 통신판매업 신고 · ⟦런칭시드⟧'),
  ('[IP] 상표 선등록 검색 — 회사명 + 4종 제품명 (국내·중국)','hb','높음',date '2026-08-18','담당 경영지원·BM·고문 · 우선순위 최우선 · 선행: 변리사 선임 · 서리블랙·바비컷·레몽드올리·리셀바인. 중국 브로 커 선점 여부 포함 · ⟦런칭시드⟧'),
  ('[IP] 국내 상표 출원 (우선심사 청구)','hb','높음',date '2026-08-25','담당 경영지원·고문 · 우선순위 최우선 · 선행: 상표 검색, BI 확정 · 5류·29·30·32류·35류 확장 지정 · ⟦런칭시드⟧'),
  ('[IP] 디자인권 출원 (용기·패키지 형태)','hb','높음',date '2026-08-25','담당 디자이너·경영지원·고문 · 선행: 패키지 아트웍 확정 · 공개 전 출원. 공개 후에는 신규성 상실 · ⟦런칭시드⟧'),
  ('[IP] 중국 상표 직접출원','hb','높음',date '2026-09-10','담당 경영지원·고문 · 선행: 상표 검색 · 마드리드 아닌 직접출원 권장 · ⟦런칭시드⟧'),
  ('[IP] 조성물특허 — 한솔 턴키 계약상 처방 권리 귀속 확인','hb','높음',date '2026-09-01','담당 BM·경영지원·고문 · 우선순위 최우선 · 선행: 계약서 확보 · 공동출원이면 기보 기술평가·팁스 활용 불가 · ⟦런칭시드⟧'),
  ('[IP] 저작권 등록 (BI·대표 이미지)','hb','보통',date '2026-09-15','담당 디자이너·경영지원 · 선행: BI 확정 · ⟦런칭시드⟧'),
  ('[IP] 조성물특허 출원 (우선심사 청구)','hb','높음',date '2026-10-31','담당 BM·경영지원·고문 · 선행: 권리 귀속 확인, 인체적용시 험 · 정부지원 가점은 등록 기준. 출원만으로는 부족 · ⟦런칭시드⟧'),
  ('[IP] 미국·일본·동남아 상표 출원 (파리조약 우선권 6개월 내)','hb','보통',date '2026-12-31','담당 경영지원·고문 · 선행: 국내 출원 · ⟦런칭시드⟧'),
  ('[IP] 아마존 Brand Registry 등록','hb','보통',null,'담당 MD · 선행: 미국 상표 등록증 · ⟦런칭시드⟧'),
  ('[정부지원] 벤처기업확인 신청','hb','보통',date '2026-12-31','담당 경영지원·고문 · 선행: 기업부설연구소 · 연구개발유형 기준 · ⟦런칭시드⟧'),
  ('[수출] 타겟국 바이어·유통 발굴 — 미국·중국·일본·동남아','hb','높음',null,'담당 MD·BM·대표이사 · 인증보다 바이어가 먼저. 순서를 뒤집으면 비용만 묶임 · ⟦런칭시드⟧'),
  ('[수출] 미국 FDA 식품시설 등록 + US Agent 선임','hb','보통',null,'담당 BM·경영지원·고문 · 선행: 미국 바이어 확보 · ⟦런칭시드⟧'),
  ('[수출] 중국 진출 방식 결정안 상신 — 일반무역 / 크로스보더(CBEC)','hb','보통',null,'담당 MD·BM·대표이사 · 선행: 중국 바이어 확보 · ⟦런칭시드⟧'),
  ('[수출] 동남아 인허가 대응 — 베트남 공표, 태국 FDA, 인니 BPOM·할랄','hb','보통',null,'담당 BM·MD·고문 · 선행: 동남아 바이어 확보 · ⟦런칭시드⟧'),
  ('[리뷰·평점] 리뷰 확보 방식 확정 — 실구매 체험단 / 리뷰 적립 이벤트 / 구매 후 CRM 유도 조합','hb','높음',date '2026-08-25','담당 마케터·MD·대표이사 · 우선순위 최우선 · 리뷰 대행·작성 방식은 표시광고법 위반이자 플랫폼 판 매정지 사유. 실구매 기반 경로만 채택 · ⟦런칭시드⟧'),
  ('[리뷰·평점] 스카이벤처스 리뷰 캠페인 계약 및 KPI 확정 (구매건수·리뷰 2,000건)','hb','높음',date '2026-08-27','담당 MD·스카이벤처스·대표이사 · 우선순위 최우선 · 선행: 리뷰 방식 확정 · 계약서에 ① 실구매 기반 명시 ② 대가 지급 시 광고·협 찬 표시 의무 ③ 어뷰징 적발 시 책임 소재 반드시 포함 · ⟦런칭시드⟧'),
  ('[리뷰·평점] 자사몰·스마트스토어 리뷰 적립 이벤트 세팅 (포토·동영상 리뷰 차등)','hb','높음',date '2026-08-27','담당 MD·마케터 · 선행: 자사몰 오픈 · 적립금 지급도 대가에 해당. 리뷰 작성란에 표시 문구 노출 · ⟦런칭시드⟧'),
  ('[리뷰·평점] 리뷰 원고 가이드 배포 — 금지 표현 세트 첨부','hb','높음',date '2026-08-26','담당 마케터·BM·고문 · 우선순위 최우선 · 선행: 공통 대체표현사전 · 소비자 리뷰라도 효능을 단정하면 광고주 책임. 체험단 가이드에 필수 첨부 · ⟦런칭시드⟧'),
  ('[리뷰·평점] 리뷰 2,000건 달성 (자사몰 + 스마트스토어 합산)','hb','높음',date '2026-09-30','담당 MD·스카이벤처스 · 우선순위 최우선 · 선행: 캠페인 개시 · ⟦런칭시드⟧'),
  ('[리뷰·평점] 리뷰 품질 모니터링 — 효능 표현 리뷰 신고·블라인드 프로세스 운영','hb','높음',date '2026-09-05','담당 마케터·BM·고문 · 주 1회 점검. 적발 리뷰는 즉시 블라인드 요청 · ⟦런칭시드⟧'),
  ('[SEO] 키워드 세트 확정 — 메인 3개 / 서브 12개 (브랜드·제품·문제인식 키워드)','hb','높음',date '2026-08-25','담당 마케터·MD · 우선순위 최우선 · 선행: 소구 재설계 완료 · 메인 키워드는 블로거 10인 발행의 기준값 · ⟦런칭시드⟧'),
  ('[SEO] 네이버 서치어드바이저 · 구글 서치콘솔 등록 및 색인 요청','hb','높음',date '2026-08-27','담당 마케터 · 우선순위 최우선 · 선행: 자사몰 오픈 · ⟦런칭시드⟧'),
  ('[SEO] 네이버 SEO — 스마트스토어 상품명·태그·상세 텍스트 최적화','hb','높음',date '2026-08-27','담당 MD·마케터 · 우선순위 최우선 · 선행: 키워드 세트 · 상품명은 승인 문구 기준. 효능 키워드 삽입 금지 · ⟦런칭시드⟧'),
  ('[SEO] 구글 SEO — 자사몰 메타태그·구조화데이터(Product 스키마)·사 이트맵','hb','높음',date '2026-09-05','담당 마케터·디자이너 · 선행: 자사몰 오픈 · ⟦런칭시드⟧'),
  ('[SEO] 브랜드 검색 1페이지 장악 점검 — 통합검색·이미지·동영상·지식 스니펫','hb','높음',date '2026-09-30','담당 마케터 · 선행: 블로거 발행 · 월 1회 정기 점검 항목으로 전환 · ⟦런칭시드⟧'),
  ('[콘텐츠·시딩] 최적화 블로거 10인 섭외 및 계약','hb','높음',date '2026-09-03','담당 마케터·스카이벤처스·대표이사 · 우선순위 최우선 · 선행: 키워드 세트 · 지수·상위노출 이력 검증 후 선정. 견적 3건 이상 비교 · ⟦런칭시드⟧'),
  ('[콘텐츠·시딩] 블로그 원고 가이드 배포 (공통 대체표현사전 첨부)','hb','높음',date '2026-09-01','담당 마케터·BM·고문 · 우선순위 최우선 · 선행: 블로거 계약 · 시딩 콘텐츠 문구도 광고주 책임. 가이드 미배포 시 위 반 위험이 10배로 늘어남 · ⟦런칭시드⟧'),
  ('[콘텐츠·시딩] 블로거 10인 발행 완료 및 메인키워드 노출 확인','hb','높음',date '2026-09-10','담당 마케터·스카이벤처스 · 우선순위 최우선 · 선행: 원고 가이드 · 본문 상단에 ''광고·협찬'' 표기 필수. 더보기 안은 미표시 로 본다 · ⟦런칭시드⟧'),
  ('[콘텐츠·시딩] 광고 소스 제작 — 영상 3종 · 이미지 10종','hb','높음',date '2026-09-05','담당 디자이너·마케터 · 선행: 제품 촬영 · 메타·네이버 DA 규격 동시 대응 · ⟦런칭시드⟧'),
  ('[콘텐츠·시딩] 유튜브 2차활용 PPL 5건 섭외 및 집행','hb','높음',date '2026-10-31','담당 대표이사·마케터 · 우선순위 최우선 · 선행: 광고 소스 · 대표 네트워크 기반 항목. 검수만 한다는 원칙의 명시적 예외. 채널별 대본은 마케터가 사전 검수 · ⟦런칭시드⟧'),
  ('[콘텐츠·시딩] 인스타 릴스·숏폼 정기 배포 (주 3회)','hb','높음',date '2026-09-01','담당 마케터·디자이너 · 선행: SNS 계정 개설 · 런칭일부터 상시 운영 · ⟦런칭시드⟧'),
  ('[광고집행] 네이버 신제품 DA 신청 및 소재 입고','hb','높음',date '2026-08-27','담당 MD·마케터·대표이사 · 우선순위 최우선 · 선행: 광고 소스 · 심사 리드타임 사전 확인. 소재 문구는 승인 문구 세트 기준 · ⟦런칭시드⟧'),
  ('[광고집행] 메타 광고 계정·픽셀·전환 이벤트 세팅','hb','높음',date '2026-08-25','담당 마케터·MD · 우선순위 최우선 · 선행: 자사몰 오픈 · 구매·장바구니·알림받기 전환 이벤트 분리 · ⟦런칭시드⟧'),
  ('[광고집행] 메타 광고 집행 — 프로스펙팅 / 리타게팅 캠페인 분리 운영','hb','높음',date '2026-08-27','담당 마케터·대표이사 · 우선순위 최우선 · 선행: 픽셀 세팅 · 예산 집행이므로 대표 승인 후 개시 · ⟦런칭시드⟧'),
  ('[광고집행] 네이버 검색광고 세팅 — 파워링크 · 쇼핑검색','hb','높음',date '2026-08-27','담당 MD·마케터 · 선행: 키워드 세트 · ⟦런칭시드⟧'),
  ('[광고집행] 채널별 ROAS 주간 점검 체계 수립','hb','높음',date '2026-09-07','담당 MD·마케터 · 선행: 광고 개시 · 채널별 손익분기 ROAS를 마진 역산표에서 산출해 기 준선으로 고정 · ⟦런칭시드⟧'),
  ('[CRM·채널자산카카오 채널 개설 및 메시지 발송 세팅] ','hb','높음',date '2026-08-25','담당 마케터 · 우선순위 최우선 · ⟦런칭시드⟧'),
  ('[CRM·채널자산카카오 채널 친구 30,000명 확보] ','hb','높음',date '2026-11-30','담당 마케터·스카이벤처스·대표이사 · 우선순위 최우선 · 선행: 채널 개설 · 확보 단가·기간·이탈 보전 조건을 계약서에 명시. 단가 확인 필요 · ⟦런칭시드⟧'),
  ('[CRM·채널자산스마트스토어 알림받기 50,000명 확보] ','hb','높음',date '2026-12-31','담당 MD·마케터·대표이사 · 우선순위 최우선 · 선행: 스토어 개설 · 알림받기 쿠폰 단가 사전 산정. 쿠폰 원가가 마진 역산 표에 반영되어야 함 · ⟦런칭시드⟧'),
  ('[CRM·채널자산카카오·알림받기 발송 캘린더 수립 (주 1회 이상)] ','hb','높음',date '2026-09-10','담당 마케터·MD · 선행: 친구 확보 개시 · 확보만 하고 발송을 안 하면 자산이 아니라 비용 · ⟦런칭시드⟧'),
  ('[채널확장] 채널별 입점 서류 패키지 표준화 — 1세트로 전 채널 대응','hb','높음',date '2026-09-01','담당 BM·MD · 우선순위 최우선 · 선행: 전성분·CT·PL증권·GS1 · 전성분, CT 성적서, 품목제조보고서, PL증권, GS1 바 코드, 사업자·통판 신고증 · ⟦런칭시드⟧'),
  ('[채널확장] 쿠팡 로켓그로스 / 로켓배송 입점 신청','hb','높음',date '2026-09-05','담당 MD·BM·대표이사 · 우선순위 최우선 · 선행: 서류 패키지 · 입고 리드타임·수수료·반품 정책 사전 확인. 마진 역산 표에 로켓 수수료 반영 · ⟦런칭시드⟧'),
  ('[채널확장] 쿠팡 리뷰 2,000건 확보','hb','높음',date '2026-12-31','담당 MD·스카이벤처스 · 선행: 로켓 입점 · 쿠팡은 어뷰징 탐지가 가장 강하고 제재가 즉각적이다. 실구매 기반만 · ⟦런칭시드⟧'),
  ('[채널확장] 카카오 선물하기 입점 신청','hb','높음',date '2026-09-30','담당 MD·대표이사 · 선행: 서류 패키지 · 선물 수요 카테고리. 세트 구성 SKU 준비 필요 · ⟦런칭시드⟧'),
  ('[채널확장] 올리브영 온라인몰 입점 제안','hb','높음',date '2026-10-15','담당 MD·BM·대표이사 · 선행: 서류 패키지 · 온라인 선진입 후 오프라인 확대가 현실적 · ⟦런칭시드⟧'),
  ('[채널확장] 무신사 입점 제안','hb','보통',date '2026-10-31','담당 MD·대표이사 · 선행: 서류 패키지 · 카테고리 적합성 검토 선행 · ⟦런칭시드⟧'),
  ('[채널확장] 추가 채널 입점 검토 — 컬리 · 11번가 · G마켓 · 오늘의집','hb','보통',date '2026-11-30','담당 MD · 선행: 서류 패키지 · ⟦런칭시드⟧'),
  ('[성과관리] 주간 판매 대시보드 구축 — 채널별 매출·ROAS·리뷰수·재고','hb','높음',date '2026-09-07','담당 MD·경영지원 · 선행: 광고 개시 · UC_운영도구_P&L과 연동 · ⟦런칭시드⟧'),
  ('[성과관리] 런칭 4주 성과 리뷰 및 예산 재배분','hb','높음',date '2026-09-24','담당 MD·마케터·대표이사 · 선행: 대시보드 · ROAS 하위 채널 예산을 상위 채널로 이관 · ⟦런칭시드⟧'),
  ('[성과관리] 재고 소진 예측 및 2차 발주 시점 판단','hb','높음',date '2026-09-15','담당 MD·BM·대표이사 · 선행: 대시보드 · 제조 리드타임 역산. 품절이 리뷰·랭킹을 되돌린다 · ⟦런칭시드⟧'),
  ('[브랜드] 법인·브랜드 표기 확정 — NA:AH / 나아 / 더나아','na','높음',date '2026-08-20','담당 BM·마케터·대표이사 · 우선순위 최우선 · 콜론(:)은 도메인 사용 불가, 상표 표장에도 제약. 표기 갈리면 상표·도메인·패키지가 전부 어긋남 · ⟦런칭시드⟧'),
  ('[판매자격] 책임판매관리자 채용 공고 게시','na','높음',date '2026-08-22','담당 경영지원·대표이사 · 우선순위 최우선 · 내부 유자격자 없음 확인됨. 채용 리드타임 1~2개 월. 나아의 실제 크리티컬 패스 · ⟦런칭시드⟧'),
  ('[판매자격] 책임판매관리자 채용 확정 또는 외부 위탁 선임','na','높음',date '2026-09-30','담당 경영지원·대표이사 · 우선순위 최우선 · 선행: 채용 공고 · 10월 중 미확정 시 27.03 런칭도 불가 · ⟦런칭시드⟧'),
  ('[판매자격] 화장품책임판매업 등록 (지방식약청)','na','높음',date '2026-10-15','담당 경영지원·고문 · 우선순위 최우선 · 선행: 책임판매관리자 선임 · ⟦런칭시드⟧'),
  ('[판매자격] 통신판매업 신고','na','높음',date '2026-10-20','담당 경영지원 · ⟦런칭시드⟧'),
  ('[판매자격] 기능성화장품 2종 확정 — 톤업로션(미백), 캡슐자차 선크림(자외선 차단)','na','높음',date '2026-09-15','담당 BM·고문 · 우선순위 최우선 · 선행: 처방 확정 · 리스트상 미백기능성·UV차단 명시. 심사 또는 보 고 대상 · ⟦런칭시드⟧'),
  ('[판매자격] 자외선차단지수(SPF/PA) 인체적용시험 의뢰','na','높음',date '2026-10-15','담당 BM·고문 · 우선순위 최우선 · 선행: 선크림 처방 확정 · 시험 4~8주. 13종 중 리드타임 최장. 선크림 출시 일을 결정 · ⟦런칭시드⟧'),
  ('[판매자격] 기능성화장품 심사 또는 보고 접수','na','높음',date '2026-12-15','담당 BM·고문 · 선행: 인체적용시험 결과 · 심사는 통상 60일. 보고 요건 충족 여부 먼저 확인 · ⟦런칭시드⟧'),
  ('[자금] 사업자 통장 5분할 개설 — 매출수취 / 운영지출 / 매입결제 / 세금유 보 / 조달자금','na','높음',date '2026-09-10','담당 경영지원·대표이사 · 선행: 법인 통장 개설 · 은행은 주거래 1곳으로 집중 · ⟦런칭시드⟧'),
  ('[자금] 신설법인 한도제한계좌 해제 신청','na','높음',date '2026-09-20','담당 경영지원 · 선행: 통장 개설 · ⟦런칭시드⟧'),
  ('[자금] 세금유보 이체 룰 세팅 — 매출수취 통장에서 월 매출의 20% 자동이 체','na','보통',date '2026-09-30','담당 경영지원·대표이사 · 선행: 통장 5분할 · ⟦런칭시드⟧'),
  ('[자금] 법인카드 발급 및 운영지출 통장 연결','na','보통',date '2026-09-30','담당 경영지원 · 선행: 통장 5분할 · ⟦런칭시드⟧'),
  ('[자금] 4대보험 성립신고','na','보통',date '2026-09-30','담당 경영지원 · ⟦런칭시드⟧'),
  ('[제품] 런칭 차수·종수 확정 — 13종 동시 / 단계 분할 결정','na','높음',date '2026-08-22','담당 BM·MD·대표이사 · 우선순위 최우선 · 리스트상 입고 27.02, 미정 5종은 제조사도 없음. 27.01 동시 런칭 불가 · ⟦런칭시드⟧'),
  ('[제품] 바나나팩토리 CGMP / ISO 22716 보유 및 책임판매업 지원 범위 확 인','na','높음',date '2026-08-22','담당 BM·고문 · 우선순위 최우선 · 8종 단일 제조사 의존. 인증 미보유 시 대체처 필요 · ⟦런칭시드⟧'),
  ('[제품] 바나나팩토리 OEM 계약 체결','na','높음',date '2026-08-31','담당 BM·경영지원·대표이사 · 우선순위 최우선 · 선행: 제조사 미팅 · IP 귀속 조항 반드시 확인 · ⟦런칭시드⟧'),
  ('[제품] 1차 8종 처방 확정 (진정광크림 샘플 3종 테스트 포함)','na','높음',date '2026-09-15','담당 BM·대표이사 · 우선순위 최우선 · 선행: OEM 계약 · 처방 확정이 전체 일정의 기점. 밀리면 27.02 입고 불가 · ⟦런칭시드⟧'),
  ('[제품] 미정 5종 제조사 선정 — 앰플세럼, 크림, 선크림(CIT), 앰플미스트, 마스크팩','na','높음',date '2026-09-30','담당 BM·대표이사 · 26.08.12 착수 표기만 있고 제조사·입고일 공란 · ⟦런칭시드⟧'),
  ('[제품] 1차 8종 발주 확정','na','높음',date '2026-10-15','담당 MD·BM·대표이사 · 선행: 처방 확정, 가격 정책 · 리스트상 발주 확정 13종 전부 미체크 · ⟦런칭시드⟧'),
  ('[서류] 1차 8종 안정성시험 착수 (가속·장기)','na','높음',date '2026-09-20','담당 BM · 우선순위 최우선 · 선행: 처방 확정 · 가속만 3개월. 9월 착수해야 12월 결과 · ⟦런칭시드⟧'),
  ('[서류] 제조사 CGMP / ISO 22716 인증서 확보','na','높음',date '2026-09-30','담당 BM · 선행: OEM 계약 · ⟦런칭시드⟧'),
  ('[서류] 전성분(INCI), 제품표준서, MSDS, CoA 취합','na','높음',date '2026-10-31','담당 BM · 선행: 처방 확정 · ⟦런칭시드⟧'),
  ('[서류] 동물실험 미실시 확인서 확보','na','높음',date '2026-10-31','담당 BM · EU·중국 수출 시 필수 · ⟦런칭시드⟧'),
  ('[서류] 알레르기 유발성분 목록 확정 및 표시 반영','na','높음',date '2026-11-15','담당 BM·디자이너·고문 · 선행: 전성분 확정 · ⟦런칭시드⟧'),
  ('[서류] 1차 8종 미생물·중금속 시험(CT) 의뢰 및 성적서 수령','na','높음',date '2026-11-30','담당 BM · 선행: 시제품 생산 · 리스트상 CT 요청·완료 13종 전부 미체크 · ⟦런칭시드⟧'),
  ('[서류] 자유판매증명서(CFS) 신청','na','보통',date '2027-01-15','담당 BM·경영지원 · 선행: 책임판매업 등록 · 수출 필수 서류 · ⟦런칭시드⟧'),
  ('[광고심의] 기획 소구 문구 실증 검토 — 4세대 / 모낭속 균 / 바를수록 미백','na','높음',date '2026-08-25','담당 마케터·BM·고문 · 우선순위 최우선 · 근거 없는 최상급·항균 효능·기능성 초과 표현. 기 획 단계에서 걸러야 함 · ⟦런칭시드⟧'),
  ('[리스크] 개발 리스트의 타겟 제품명 표기 정리 (내부 코드로 치환)','na','높음',date '2026-08-22','담당 BM·마케터·대표이사 · 경쟁사 제품명이 시트에 그대로 기재됨. 외부 공유 시 카피 프레임·부정경쟁 이슈 · ⟦런칭시드⟧'),
  ('[광고심의] 표시광고 실증자료 확보·보관 체계 수립','na','높음',date '2026-12-01','담당 마케터·BM·고문 · 화장품은 사전심의 없으나 실증자료 보관 의무 · ⟦런칭시드⟧'),
  ('[브랜드] BI 최종본 확정 (상표 출원용 도형 포함)','na','높음',date '2026-09-05','담당 디자이너·마케터·대표이사 · 우선순위 최우선 · 선행: 표기 확정 · 상표 출원과 패키지 인쇄의 선행조건 · ⟦런칭시드⟧'),
  ('[브랜드] 도메인·SNS 핸들 선점 — 전 채널','na','높음',date '2026-08-25','담당 마케터 · 우선순위 최우선 · 선행: 표기 확정 · 콜론 없는 표기로 확보 · ⟦런칭시드⟧'),
  ('[콘텐츠] 1차 8종 패키지 디자인·아트웍 (바코드·표시사항 반영)','na','높음',date '2026-12-15','담당 디자이너·BM·대표이사 · 선행: GS1 바코드, 전성분 확정 · ⟦런칭시드⟧'),
  ('[콘텐츠] 1차 8종 제품 촬영 및 상세페이지 제작','na','높음',date '2027-01-31','담당 디자이너·마케터 · 선행: 패키지 실물 · ⟦런칭시드⟧'),
  ('[콘텐츠] SNS 계정 개설 및 초기 피드','na','보통',date '2027-01-31','담당 마케터·디자이너 · 선행: 핸들 선점 · ⟦런칭시드⟧'),
  ('[홍보] 언론보도 배포처 리스트·견적','na','보통',date '2027-02-15','담당 마케터·대표이사 · ⟦런칭시드⟧'),
  ('[홍보] 런칭 보도자료 작성 및 배포','na','보통',date '2027-03-02','담당 마케터·대표이사 · 선행: 런칭일 확정 · 대외 발송이므로 대표 승인 후 배포 · ⟦런칭시드⟧'),
  ('[유통인프라] GS1 회원가입 및 표준바코드(GTIN) 발급','na','높음',date '2026-09-30','담당 BM·디자이너 · 패키지 인쇄의 선행조건 · ⟦런칭시드⟧'),
  ('[유통인프라] SKU 코드 체계 확정','na','높음',date '2026-09-30','담당 BM·MD · 선행: 런칭 차수 확정 · ⟦런칭시드⟧'),
  ('[유통인프라] 완제품 입고 전 3PL 업체 세팅 완료','na','높음',date '2027-01-15','담당 경영지원·MD · 우선순위 최우선 · 선행: 3PL 계약 · 개발 리스트 상단 명시 사항. 입고 전 완료 필수 · ⟦런칭시드⟧'),
  ('[유통인프라] 생산물배상책임보험(PL) 가입','na','높음',date '2027-01-20','담당 경영지원 · 선행: 전성분, CT 성적서 · ⟦런칭시드⟧'),
  ('[유통인프라] 반품·CS·교환 규정 문서화','na','높음',date '2027-01-31','담당 BM·경영지원·대표이사 · ⟦런칭시드⟧'),
  ('[가격정책] 채널별 마진 역산표 작성 (자사몰/올영/쿠팡/공구/오프라인)','na','높음',date '2026-09-30','담당 MD·경영지원 · 선행: 런칭 차수 확정 · ⟦런칭시드⟧'),
  ('[가격정책] 1차 8종 채널별 가격 정책 확정안 상신','na','높음',date '2026-10-10','담당 MD·경영지원·대표이사 · 선행: 마진 역산표 · 발주 확정의 선행조건 · ⟦런칭시드⟧'),
  ('[유통] 올리브영 입점 제안서 작성 및 상신','na','높음',date '2026-12-01','담당 MD·BM·대표이사 · 선행: 처방 확정 · 대외 제출이므로 대표 승인 후 발송 · ⟦런칭시드⟧'),
  ('[유통] 자사몰 구축','na','높음',date '2027-02-10','담당 MD·디자이너 · 선행: 통신판매업 신고 · ⟦런칭시드⟧'),
  ('[유통] 온라인 채널 입점 등록 (스마트스토어·쿠팡·무신사 등)','na','높음',date '2027-02-20','담당 MD · 선행: 통신판매업 신고 · ⟦런칭시드⟧'),
  ('[IP] 상표 선등록 검색 — 회사명 + 제품명 (국내·중국)','na','높음',date '2026-08-25','담당 경영지원·BM·고문 · 우선순위 최우선 · 선행: 변리사 선임, 표기 확정 · 중국 브로커 선점 여부 확인 포함 · ⟦런칭시드⟧'),
  ('[IP] 국내 상표 출원 (우선심사 청구)','na','높음',date '2026-09-10','담당 경영지원·고문 · 우선순위 최우선 · 선행: 상표 검색, BI 확정 · 3류·5류·35류 지정 · ⟦런칭시드⟧'),
  ('[IP] 중국 상표 직접출원','na','높음',date '2026-09-30','담당 경영지원·고문 · 선행: 상표 검색 · 마드리드 아닌 직접출원 권장 · ⟦런칭시드⟧'),
  ('[IP] 저작권 등록 (BI·대표 이미지)','na','보통',date '2026-10-15','담당 디자이너·경영지원 · 선행: BI 확정 · ⟦런칭시드⟧'),
  ('[IP] 디자인권 출원 (용기·패키지 형태)','na','높음',date '2026-12-20','담당 디자이너·경영지원·고문 · 선행: 패키지 아트웍 확정 · 공개 전 출원. 공개 후에는 신규성 상실 · ⟦런칭시드⟧'),
  ('[IP] 미국·일본·동남아 상표 출원 (파리조약 우선권 6개월 내)','na','보통',date '2027-03-10','담당 경영지원·고문 · 선행: 국내 출원 · ⟦런칭시드⟧'),
  ('[IP] 아마존 Brand Registry 등록','na','보통',null,'담당 MD · 선행: 미국 상표 등록증 · ⟦런칭시드⟧'),
  ('[정부지원] 벤처기업확인 신청','na','보통',date '2027-03-31','담당 경영지원·고문 · 선행: 기업부설연구소 · 연구개발유형 기준 · ⟦런칭시드⟧'),
  ('[수출] 타겟국 바이어·유통 발굴 — 미국·중국·일본·동남아','na','높음',null,'담당 MD·BM·대표이사 · 인증보다 바이어가 먼저 · ⟦런칭시드⟧'),
  ('[수출] 미국 MoCRA 대응 — US Agent 선임, 제품 리스팅','na','보통',null,'담당 BM·경영지원·고문 · 선행: 미국 바이어 확보 · 시설등록은 OEM사 의무, 제품 리스팅은 당사(RP) 의무 · ⟦런칭시드⟧'),
  ('[수출] 중국 진출 방식 결정안 상신 — NMPA 비안 / 크로스보더(CBEC)','na','보통',null,'담당 MD·BM·대표이사 · 선행: 중국 바이어 확보 · ⟦런칭시드⟧'),
  ('[수출] 일본 화장품 제조판매업 파트너 발굴','na','보통',null,'담당 MD·BM·고문 · 선행: 일본 바이어 확보 · 현지 허가 보유 파트너 없이는 수입 불가 · ⟦런칭시드⟧'),
  ('[수출] 동남아 인허가 대응 — 인니 BPOM·할랄, 베트남 공표, 태국 FDA','na','보통',null,'담당 BM·MD·고문 · 선행: 동남아 바이어 확보 · 인니 화장품 할랄 의무화 2026-10-17 시행 확정 · ⟦런칭시드⟧')
) as v(title, slug, priority, due, note)
left join public.brands b on nullif(v.slug,'') = b.slug;

