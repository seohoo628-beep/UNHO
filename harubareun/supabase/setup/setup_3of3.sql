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

