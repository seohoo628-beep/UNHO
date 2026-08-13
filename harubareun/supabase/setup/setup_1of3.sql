-- ============================================================
-- 하루바른·나아 플랫폼 DB 설정 통합본 — setup/setup_1of3.sql
-- Supabase SQL Editor에 통째로 붙여넣고 Run 하세요.
-- ============================================================

-- ▼▼▼ migrations/0001_schema.sql ▼▼▼
-- ============================================================================
-- 운호컴퍼니 운영 플랫폼 — Phase 1 스키마
-- 대상: corporations, brands, users, tasks, ai_outputs, compliance_checks,
--       approvals
-- 시간대는 애플리케이션에서 Asia/Seoul로 다루고, 저장은 timestamptz(UTC)로 한다.
-- ============================================================================

create extension if not exists "pgcrypto";

-- 역할 3종: 대표(owner) / 직원(staff) / AI 직원(ai)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('owner', 'staff', 'ai');
  end if;
end$$;

-- ── 공용 updated_at 트리거 ──────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

-- ── corporations : 법인·당사자 ──────────────────────────────────────────────
create table if not exists public.corporations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  kind         text not null check (kind in ('own', 'partner', 'affiliate')), -- 자사/파트너/제휴
  entity_type  text not null default 'own' check (entity_type in ('own', 'partner')), -- own/partner 2분류
  business_no  text,
  founded      text,          -- 설립연월 (예: 2024.02). 2019년 개인사업자 개시는 note에.
  ceo          text,
  address      text,
  confirmed    text not null default '확정' check (confirmed in ('확정', '부분 확정', '미확정')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── brands : 브랜드 ─────────────────────────────────────────────────────────
create table if not exists public.brands (
  id              uuid primary key default gen_random_uuid(),
  corporation_id  uuid not null references public.corporations(id) on delete restrict,
  name            text not null unique,
  slug            text not null unique,        -- 약어 (rb, bb, sr ...). 파일명 규칙에 사용.
  category        text,                        -- 화장품 / 건강기능식품 / 식품 / F&B / 의료
  flagship        text,                        -- 대표 제품
  channel         text,                        -- 도메인·채널
  regulation      text,                        -- 표시광고 규제 근거
  op_status       text,                        -- 운영 상태
  confirmed       text not null default '확정',
  note            text,
  -- AI 자동 생성 대상 여부. 엣지라인의원(의료광고 사전심의)은 false.
  ai_enabled      boolean not null default true,
  -- VI 팔레트
  vi_primary      text,
  vi_secondary    text,
  vi_accent       text,
  vi_bg           text,
  font_ko         text not null default 'Pretendard',
  font_en         text not null default 'Pretendard',
  tone            text,                        -- 톤 3줄 정의
  vi_confirmed    text not null default '제안' check (vi_confirmed in ('제안', '확정')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_brands_corp on public.brands(corporation_id);
create index if not exists idx_brands_ai_enabled on public.brands(ai_enabled);

-- ── users : 사용자 ──────────────────────────────────────────────────────────
-- auth_id 는 최초 로그인 시 이메일로 매칭해 서버(서비스 롤)에서 연결한다.
create table if not exists public.users (
  id                 uuid primary key default gen_random_uuid(),
  auth_id            uuid unique references auth.users(id) on delete set null,
  email              text not null unique,
  name               text,
  role               app_role not null,
  job_title          text,                     -- 대표 / 경영지원 / 영업이사
  assigned_brand_ids uuid[] not null default '{}',
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- ── tasks : 업무 ────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid references public.brands(id) on delete set null,
  title             text not null,             -- 업무 내용
  category          text,                      -- 업무 카테고리
  assignee_kind     text not null default 'user' check (assignee_kind in ('user', 'ai')),
  assignee_user_id  uuid references public.users(id) on delete set null,
  ai_agent_type     text,                      -- 'marketer' 등
  status            text not null default '예정'
                    check (status in ('예정', '진행', '완료', '지연', '보류', '취소')),
  due_date          date,                      -- 완료 목표일
  completed_date    date,                      -- 실제 완료일
  wait_reason       text,                      -- 대기 사유
  wait_target       text,                      -- 대기 대상 (대표 등). 지연의 대부분이 회신 대기.
  note              text,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_tasks_brand on public.tasks(brand_id);
create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_tasks_wait_target on public.tasks(wait_target);

-- ── ai_outputs : AI 산출물 ──────────────────────────────────────────────────
create table if not exists public.ai_outputs (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid references public.tasks(id) on delete set null,
  brand_id          uuid not null references public.brands(id) on delete cascade,
  agent_type        text not null,             -- 'marketer'
  title             text,
  input_prompt      text,                      -- 프롬프트 조립 결과 (감사용)
  body              text,                      -- 결과 본문
  attachments       jsonb not null default '[]'::jsonb,
  compliance_status text not null default 'pending'
                    check (compliance_status in ('pending', 'pass', 'fail')),
  approval_status   text not null default 'pending'
                    check (approval_status in ('pending', 'approved', 'rejected', 'revision_requested')),
  revision_note     text,                      -- 수정 요청 내용
  model             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_ai_outputs_brand on public.ai_outputs(brand_id);
create index if not exists idx_ai_outputs_queue
  on public.ai_outputs(compliance_status, approval_status);

-- ── compliance_checks : 규제 검수 결과 ──────────────────────────────────────
create table if not exists public.compliance_checks (
  id            uuid primary key default gen_random_uuid(),
  ai_output_id  uuid not null references public.ai_outputs(id) on delete cascade,
  brand_id      uuid references public.brands(id) on delete set null,
  regulation    text,                          -- 검수 시점 브랜드 규제 근거 스냅샷
  verdict       text not null check (verdict in ('pass', 'fail')),
  findings      jsonb not null default '[]'::jsonb, -- [{phrase, reason, suggestion, rule}]
  checker       text not null default 'rule-based',
  checked_at    timestamptz not null default now()
);
create index if not exists idx_compliance_output on public.compliance_checks(ai_output_id);

-- ── approvals : 승인 이력 ───────────────────────────────────────────────────
create table if not exists public.approvals (
  id                uuid primary key default gen_random_uuid(),
  ai_output_id      uuid not null references public.ai_outputs(id) on delete cascade,
  approver_user_id  uuid references public.users(id) on delete set null,
  decision          text not null check (decision in ('approved', 'rejected', 'revision_requested')),
  reason            text,
  decided_at        timestamptz not null default now()
);
create index if not exists idx_approvals_output on public.approvals(ai_output_id);

-- ── updated_at 트리거 ───────────────────────────────────────────────────────
drop trigger if exists trg_corp_touch on public.corporations;
create trigger trg_corp_touch before update on public.corporations
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_brands_touch on public.brands;
create trigger trg_brands_touch before update on public.brands
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_tasks_touch on public.tasks;
create trigger trg_tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_ai_outputs_touch on public.ai_outputs;
create trigger trg_ai_outputs_touch before update on public.ai_outputs
  for each row execute function public.touch_updated_at();


-- ▼▼▼ migrations/0002_rls.sql ▼▼▼
-- ============================================================================
-- Row Level Security — 역할별 격리
--
-- 원칙
--  - 대표(owner)  : 전체 열람, 승인·반려·수정요청, 브랜드·업무 편집
--  - 직원(staff)  : 전체 열람, 업무 등록·수정, 브랜드 편집, 수정요청
--  - AI(ai)       : 로그인 세션이 없다. 산출물 기록은 서버 라우트의 service_role
--                   키로만 이뤄지며 RLS를 우회한다. 따라서 브라우저 세션으로는
--                   승인·발송·금액확정이 구조적으로 불가능하다.
--
-- 승인/반려(approved/rejected)는 대표만, 수정요청(revision_requested)은 직원도
-- 가능하다. 이 세부 규칙은 서버 액션에서 역할로 한 번 더 막고, RLS는 세션 사용자
-- 본인 명의로만 이력을 남기도록 강제한다.
-- ============================================================================

-- ── 현재 세션 사용자 헬퍼 (SECURITY DEFINER 로 users RLS 재귀 방지) ──────────
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.users
   where auth_id = auth.uid() and active = true
   limit 1;
$$;

create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users
   where auth_id = auth.uid() and active = true
   limit 1;
$$;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_user_id() to authenticated;

-- ── RLS 활성화 ──────────────────────────────────────────────────────────────
alter table public.corporations      enable row level security;
alter table public.brands            enable row level security;
alter table public.users             enable row level security;
alter table public.tasks             enable row level security;
alter table public.ai_outputs        enable row level security;
alter table public.compliance_checks enable row level security;
alter table public.approvals         enable row level security;

-- ── corporations ────────────────────────────────────────────────────────────
drop policy if exists corp_select on public.corporations;
create policy corp_select on public.corporations
  for select to authenticated using (true);

drop policy if exists corp_write on public.corporations;
create policy corp_write on public.corporations
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

-- ── brands ──────────────────────────────────────────────────────────────────
drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands
  for select to authenticated using (true);

drop policy if exists brands_write on public.brands;
create policy brands_write on public.brands
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

-- ── users ───────────────────────────────────────────────────────────────────
-- 열람은 로그인 사용자 전원(담당자 이름 렌더링 필요). 편집은 대표만.
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated using (true);

drop policy if exists users_write on public.users;
create policy users_write on public.users
  for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

-- ── tasks ───────────────────────────────────────────────────────────────────
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated using (true);

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'staff'));

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.current_app_role() = 'owner');

-- ── ai_outputs ──────────────────────────────────────────────────────────────
-- 열람: 로그인 사용자 전원. 생성: service_role(서버)만 — 클라이언트 insert 정책 없음.
-- 갱신: 대표·직원 (승인 결정/수정요청 반영). 승인·반려 자체의 역할 제한은 서버 액션.
drop policy if exists ai_outputs_select on public.ai_outputs;
create policy ai_outputs_select on public.ai_outputs
  for select to authenticated using (true);

drop policy if exists ai_outputs_update on public.ai_outputs;
create policy ai_outputs_update on public.ai_outputs
  for update to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
-- INSERT/DELETE 정책 없음 → authenticated 세션은 산출물을 만들거나 지울 수 없다.

-- ── compliance_checks ───────────────────────────────────────────────────────
-- 열람만 허용. 기록은 service_role(서버 검수)만.
drop policy if exists compliance_select on public.compliance_checks;
create policy compliance_select on public.compliance_checks
  for select to authenticated using (true);

-- ── approvals ───────────────────────────────────────────────────────────────
-- 열람: 전원. 기록: 대표·직원이 본인 명의로만.
drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals
  for select to authenticated using (true);

drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals
  for insert to authenticated
  with check (
    public.current_app_role() in ('owner', 'staff')
    and approver_user_id = public.current_user_id()
  );


-- ▼▼▼ migrations/0003_seed_brand_master.sql ▼▼▼
-- ============================================================================
-- 브랜드/법인 기초 시드 — 하루바른 · 나아 통합 플랫폼
-- 이관 후에는 이 DB가 원본이다. 브랜드·법인 값은 앱에서 하드코딩하지 않고
-- 전부 이 테이블에서 읽는다. 재실행 가능하도록 upsert 로 작성.
--
-- ⚠️ 카테고리·규제 근거·주력제품·VI 팔레트·톤은 임시 기본값이다.
--    실제 브랜드 정보 확정 후 /brands 화면 또는 이 시드에서 교체한다.
-- ============================================================================

-- ── 법인마스터 ──────────────────────────────────────────────────────────────
insert into public.corporations (name, kind, entity_type, business_no, founded, ceo, address, confirmed, note) values
  ('하루바른㈜', 'own', 'own', null, null, null, null, '미확정',
   '하루바른·나아 두 브랜드를 운영하는 자사 법인. 사업자번호·설립연월·대표·주소 확정 필요.')
on conflict (name) do update set
  kind = excluded.kind, entity_type = excluded.entity_type, business_no = excluded.business_no,
  founded = excluded.founded, ceo = excluded.ceo, address = excluded.address,
  confirmed = excluded.confirmed, note = excluded.note;

-- ── 브랜드마스터 + VI규격 (소속 법인은 이름으로 조인) ────────────────────────
insert into public.brands
  (corporation_id, name, slug, category, flagship, channel, regulation, op_status,
   confirmed, ai_enabled, vi_primary, vi_secondary, vi_accent, vi_bg, tone, vi_confirmed, note)
select c.id, v.name, v.slug, v.category, v.flagship, v.channel, v.regulation, v.op_status,
       v.confirmed, v.ai_enabled, v.vi_primary, v.vi_secondary, v.vi_accent, v.vi_bg,
       v.tone, v.vi_confirmed, v.note
from (values
  ('하루바른㈜', '하루바른', 'hb', '건강기능식품·식품', null, null,
   '건강기능식품법 / 식품표시광고법', '운영', '미확정', true,
   '#3F7D4E', '#DCE8D5', '#E8A33D', '#F7FAF4',
   '매일 바르게 챙기는 하루. 효능을 단정하지 않고 습관·루틴으로 말한다. 자연·정직한 톤.', '제안',
   '임시 기본값. 카테고리·규제 근거·주력제품·VI 확정 후 교체.'),
  ('하루바른㈜', '나아', 'na', '건강기능식품·식품', null, null,
   '식품표시광고법', '운영', '미확정', true,
   '#2C6E7F', '#CFE3E6', '#E0846B', '#F6FAFB',
   '조금씩 나아지는 감각. 과장 없이 변화의 과정을 보여준다. 부드럽고 신뢰감 있는 톤.', '제안',
   '임시 기본값. 카테고리·규제 근거·주력제품·VI 확정 후 교체.')
) as v(corp, name, slug, category, flagship, channel, regulation, op_status, confirmed,
       ai_enabled, vi_primary, vi_secondary, vi_accent, vi_bg, tone, vi_confirmed, note)
join public.corporations c on c.name = v.corp
on conflict (slug) do update set
  corporation_id = excluded.corporation_id, name = excluded.name, category = excluded.category,
  flagship = excluded.flagship, channel = excluded.channel, regulation = excluded.regulation,
  op_status = excluded.op_status, confirmed = excluded.confirmed, ai_enabled = excluded.ai_enabled,
  vi_primary = excluded.vi_primary, vi_secondary = excluded.vi_secondary,
  vi_accent = excluded.vi_accent, vi_bg = excluded.vi_bg, tone = excluded.tone,
  vi_confirmed = excluded.vi_confirmed, note = excluded.note;

-- ── 사용자 ──────────────────────────────────────────────────────────────────
-- auth_id 는 최초 매직링크 로그인 시 이메일 매칭으로 연결한다(서버 콜백).
-- 이메일은 실제 계정으로 교체한다. role: owner=대표, staff=직원, ai=AI 직원.
insert into public.users (email, name, role, job_title) values
  ('seohoo628@gmail.com',   '대표',    'owner', '대표'),
  ('staff@harubareun.com',  '직원',    'staff', '경영지원'),
  ('ai@harubareun.com',     'AI 직원', 'ai',    'AI 에이전트')
on conflict (email) do update set
  name = excluded.name, role = excluded.role, job_title = excluded.job_title;


-- ▼▼▼ migrations/0004_entity_type_and_ai_scope.sql ▼▼▼
-- ============================================================================
-- 0004 — corporations.entity_type 추가 + AI 자동 생성 대상 축소
--
-- 이미 0001~0003 이 적용된 DB를 최신 상태로 수렴시킨다(전방 마이그레이션).
-- 신규 설치는 0001(컬럼)·0003(시드)에 이미 반영돼 있어 여기서는 멱등하게 동작한다.
-- ============================================================================

-- 1) entity_type (own/partner) 컬럼 추가
alter table public.corporations
  add column if not exists entity_type text not null default 'own'
  check (entity_type in ('own', 'partner'));

-- 2) 법인 구분: 하루바른㈜ = own (자사)
update public.corporations set entity_type = 'own'
 where name in ('하루바른㈜');

-- 3) AI 자동 생성 대상 — 하루바른(hb)·나아(na) 모두 포함
update public.brands set ai_enabled = true
 where slug in ('hb', 'na');


-- ▼▼▼ migrations/0005_phase2_3_schema.sql ▼▼▼
-- ============================================================================
-- Phase 2/3 스키마 — 거래처·발주·재고, 외주업체(격리), 성과, 첨부
--   vendors            외주·거래처
--   vendor_price_history 단가 이력
--   purchase_orders    발주-입고-정산 (한 행에서 대사)
--   inventory_items    재고 소진 예측 입력값
--   performance        집행 후 성과
--   attachments        Supabase Storage 참조
-- 역할에 vendor 추가하고, 외주업체는 자기 데이터만 보도록 RLS를 강화한다.
-- ============================================================================

-- 역할에 vendor 추가 (텍스트 비교로만 쓰므로 같은 스크립트에서 enum 리터럴은 안 쓴다)
alter type app_role add value if not exists 'vendor';

-- users 에 vendor 연결 컬럼
alter table public.users add column if not exists vendor_id uuid;

-- ── vendors ────────────────────────────────────────────────────────────────
create table if not exists public.vendors (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,                 -- 거래처코드 (V-RB-01)
  name            text not null,
  kind            text,                        -- 제조/유통/부자재/물류/용역/시딩/촬영/디자인
  brand_id        uuid references public.brands(id) on delete set null,
  brand_name      text,                        -- 참조용 원본 표기
  business_no     text,
  ceo             text,
  contact_name    text,
  phone           text,
  email           text,
  address         text,
  payment_terms   text,                        -- 결제조건
  payment_day     text,
  account         text,                        -- 계좌
  lead_time_days  int,
  moq             int,
  contract_status text,                        -- 계약/무계약/협의중
  contract_expiry date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_vendors_brand on public.vendors(brand_id);

-- users.vendor_id FK (테이블 생성 후 연결)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'users_vendor_fk') then
    alter table public.users
      add constraint users_vendor_fk foreign key (vendor_id)
      references public.vendors(id) on delete set null;
  end if;
end $$;

-- ── vendor_price_history : 단가 이력 (원가/마진 민감 → 자사만 열람) ───────────
create table if not exists public.vendor_price_history (
  id             uuid primary key default gen_random_uuid(),
  vendor_id      uuid not null references public.vendors(id) on delete cascade,
  item           text,
  unit_price     numeric,                      -- 대표 확정값만 입력
  effective_date date,
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_price_vendor on public.vendor_price_history(vendor_id);

-- ── purchase_orders : 발주-입고-정산 대사 ───────────────────────────────────
create table if not exists public.purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  po_number      text unique,
  po_date        date,
  vendor_id      uuid references public.vendors(id) on delete set null,
  brand_id       uuid references public.brands(id) on delete set null,
  item           text,
  order_qty      numeric,
  unit_price     numeric,                      -- 금액은 대표가 입력한 값만
  order_amount   numeric,
  receipt_date   date,
  receipt_qty    numeric,
  lot_no         text,                         -- 제조번호 (건기식·식품 필수)
  expiry_date    date,                         -- 유통기한
  tax_invoice    text,                         -- 세금계산서 상태
  invoice_amount numeric,
  payment_date   date,
  payment_amount numeric,
  status         text not null default '발주'
                 check (status in ('발주','부분입고','입고완료','계산서수취','지급완료','취소')),
  note           text,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_po_vendor on public.purchase_orders(vendor_id);
create index if not exists idx_po_status on public.purchase_orders(status);

-- ── inventory_items : 재고 소진 예측 입력값 ─────────────────────────────────
create table if not exists public.inventory_items (
  id             uuid primary key default gen_random_uuid(),
  item           text not null,
  brand_id       uuid references public.brands(id) on delete set null,
  vendor_id      uuid references public.vendors(id) on delete set null,
  current_stock  numeric,                      -- 현재고
  out_30d        numeric,                       -- 최근 30일 출고
  safety_days    int not null default 7,       -- 안전여유(일)
  lead_time_days int,
  note           text,
  updated_at     timestamptz not null default now()
);

-- ── performance : 집행 후 성과 ──────────────────────────────────────────────
create table if not exists public.performance (
  id            uuid primary key default gen_random_uuid(),
  ai_output_id  uuid references public.ai_outputs(id) on delete set null,
  brand_id      uuid references public.brands(id) on delete set null,
  channel       text,                          -- 채널
  reach         numeric,                       -- 도달
  conversions   numeric,                       -- 전환
  revenue       numeric,                       -- 매출 (대표 확정값)
  recorded_at   date not null default (now() at time zone 'Asia/Seoul')::date,
  note          text,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_perf_brand on public.performance(brand_id);

-- ── attachments : Supabase Storage 참조 ─────────────────────────────────────
create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid references public.tasks(id) on delete cascade,
  ai_output_id  uuid references public.ai_outputs(id) on delete cascade,
  vendor_id     uuid references public.vendors(id) on delete set null,
  storage_path  text not null,                 -- 버킷 내 경로
  file_name     text,
  uploaded_by   uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_attach_task on public.attachments(task_id);
create index if not exists idx_attach_vendor on public.attachments(vendor_id);

-- ── tasks 에 vendor 배정 지원 ───────────────────────────────────────────────
alter table public.tasks add column if not exists assignee_vendor_id uuid
  references public.vendors(id) on delete set null;
-- assignee_kind 체크에 'vendor' 허용
do $$ begin
  alter table public.tasks drop constraint if exists tasks_assignee_kind_check;
  alter table public.tasks add constraint tasks_assignee_kind_check
    check (assignee_kind in ('user','ai','vendor'));
exception when others then null;
end $$;

-- ── updated_at 트리거 ───────────────────────────────────────────────────────
drop trigger if exists trg_vendors_touch on public.vendors;
create trigger trg_vendors_touch before update on public.vendors
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_po_touch on public.purchase_orders;
create trigger trg_po_touch before update on public.purchase_orders
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_inv_touch on public.inventory_items;
create trigger trg_inv_touch before update on public.inventory_items
  for each row execute function public.touch_updated_at();


