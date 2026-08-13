-- ============================================================
-- 하루바른·나아 플랫폼 DB 설정 통합본 — setup/setup_2of3.sql
-- Supabase SQL Editor에 통째로 붙여넣고 Run 하세요.
-- ============================================================

-- ▼▼▼ migrations/0006_phase2_3_rls.sql ▼▼▼
-- ============================================================================
-- Phase 2/3 RLS — 외주업체(vendor) 데이터 격리
--
-- 외주업체는 배정된 업무·자기 발주(정산) 현황·자기 업로드만 본다.
-- 다른 업체 정보, 다른 업체 단가, 자사 마진, AI 마케팅 산출물, 법인/사용자 명부,
-- 재고·성과는 볼 수 없다.
-- 0005 에서 추가한 'vendor' enum 값이 커밋된 뒤 실행한다(별도 실행).
-- ============================================================================

create or replace function public.current_vendor_id()
returns uuid language sql stable security definer set search_path = public as $$
  select vendor_id from public.users
   where auth_id = auth.uid() and active = true limit 1;
$$;
grant execute on function public.current_vendor_id() to authenticated;

-- ── 기존 정책 재정의: vendor 는 내부 데이터 열람 불가 ────────────────────────
-- users: 자사(owner/staff)만 전체, vendor 는 본인만
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or auth_id = auth.uid()
  );

-- corporations / ai_outputs / approvals / compliance_checks: 자사만
drop policy if exists corp_select on public.corporations;
create policy corp_select on public.corporations
  for select to authenticated
  using (public.current_app_role() in ('owner','staff'));

drop policy if exists ai_outputs_select on public.ai_outputs;
create policy ai_outputs_select on public.ai_outputs
  for select to authenticated
  using (public.current_app_role() in ('owner','staff'));

drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals
  for select to authenticated
  using (public.current_app_role() in ('owner','staff'));

drop policy if exists compliance_select on public.compliance_checks;
create policy compliance_select on public.compliance_checks
  for select to authenticated
  using (public.current_app_role() in ('owner','staff'));

-- brands: 이름·VI 는 민감정보 아님. 자사 전체 + vendor 는 자기 담당 브랜드만
drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands
  for select to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or id = (select brand_id from public.vendors where id = public.current_vendor_id())
  );

-- tasks: 자사 전체, vendor 는 자기 배정분만
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or assignee_vendor_id = public.current_vendor_id()
  );

-- tasks update: 자사 + vendor 는 자기 배정 업무의 진행 보고
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or assignee_vendor_id = public.current_vendor_id()
  )
  with check (
    public.current_app_role() in ('owner','staff')
    or assignee_vendor_id = public.current_vendor_id()
  );

-- ── 신규 테이블 RLS ─────────────────────────────────────────────────────────
alter table public.vendors              enable row level security;
alter table public.vendor_price_history enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.inventory_items      enable row level security;
alter table public.performance          enable row level security;
alter table public.attachments          enable row level security;

-- vendors: 자사 전체, vendor 는 본인 업체만
drop policy if exists vendors_select on public.vendors;
create policy vendors_select on public.vendors
  for select to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or id = public.current_vendor_id()
  );
drop policy if exists vendors_write on public.vendors;
create policy vendors_write on public.vendors
  for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

-- 단가 이력: 자사만 (원가·마진 보호)
drop policy if exists price_all on public.vendor_price_history;
create policy price_all on public.vendor_price_history
  for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

-- 발주: 자사 전체, vendor 는 자기 발주(정산 현황)만 열람
drop policy if exists po_select on public.purchase_orders;
create policy po_select on public.purchase_orders
  for select to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or vendor_id = public.current_vendor_id()
  );
drop policy if exists po_write on public.purchase_orders;
create policy po_write on public.purchase_orders
  for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

-- 재고·성과: 자사만
drop policy if exists inv_all on public.inventory_items;
create policy inv_all on public.inventory_items
  for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

drop policy if exists perf_all on public.performance;
create policy perf_all on public.performance
  for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

-- 첨부: 자사 전체, vendor 는 자기 것만 열람/업로드
drop policy if exists attach_select on public.attachments;
create policy attach_select on public.attachments
  for select to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or vendor_id = public.current_vendor_id()
  );
drop policy if exists attach_insert on public.attachments;
create policy attach_insert on public.attachments
  for insert to authenticated
  with check (
    public.current_app_role() in ('owner','staff')
    or vendor_id = public.current_vendor_id()
  );
drop policy if exists attach_write on public.attachments;
create policy attach_write on public.attachments
  for update to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0007_enable_brands_seed_vendors.sql ▼▼▼
-- ============================================================================
-- 0007 — 전 브랜드 AI 자동 생성 포함 + 거래처(vendors) 예시 데이터
--   하루바른·나아 통합 플랫폼. 거래처/발주/재고는 실제 데이터로 교체한다.
-- ============================================================================

-- 하루바른(hb)·나아(na) 모두 AI 자동 생성 포함.
update public.brands set ai_enabled = true where slug in ('hb', 'na');

-- ── 거래처(vendors) — 예시 1건(실제 거래처로 교체) ─────────────────────────
insert into public.vendors
  (code, name, kind, brand_id, brand_name, lead_time_days, moq, contract_status, payment_terms, note)
select 'V-HB-01', '예시 제조사', '제조', b.id, '하루바른', 21, 500, '협의중', '발주 후 50/50',
       '예시 데이터. 실제 거래처·단가·MOQ 확정 후 교체.'
from public.brands b where b.slug = 'hb'
on conflict (code) do update set
  name = excluded.name, kind = excluded.kind, brand_id = excluded.brand_id,
  lead_time_days = excluded.lead_time_days, moq = excluded.moq,
  contract_status = excluded.contract_status, payment_terms = excluded.payment_terms,
  note = excluded.note;

-- ── 발주(purchase_orders) — 예시 1건 ────────────────────────────────────────
insert into public.purchase_orders
  (po_number, po_date, vendor_id, brand_id, item, order_qty, status, note)
select 'PO-HB-000001', current_date, v.id, b.id, '예시 품목', 500, '발주',
       '예시 데이터. 실제 발주 내역으로 교체.'
from public.vendors v, public.brands b
where v.code = 'V-HB-01' and b.slug = 'hb'
on conflict (po_number) do update set
  po_date = excluded.po_date, item = excluded.item, order_qty = excluded.order_qty,
  status = excluded.status, note = excluded.note;

-- ── 재고(inventory_items) — 예시 1건 ────────────────────────────────────────
insert into public.inventory_items
  (item, brand_id, vendor_id, current_stock, out_30d, safety_days, lead_time_days)
select '예시 품목', b.id, v.id, 320, 210, 7, 21
from public.brands b, public.vendors v
where b.slug = 'hb' and v.code = 'V-HB-01'
  and not exists (
    select 1 from public.inventory_items i where i.item = '예시 품목'
  );


-- ▼▼▼ migrations/0008_app_settings.sql ▼▼▼
-- ============================================================================
-- 0008 — 앱 설정 저장소 (카카오 알림 연결 등). key/value.
-- 대표만 열람·수정. 서버(cron/callback)는 service_role 로 우회 접근.
-- ============================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists settings_owner on public.app_settings;
create policy settings_owner on public.app_settings
  for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');


-- ▼▼▼ migrations/0009_crm_leads.sql ▼▼▼
-- ============================================================================
-- 0009 — 셀러/바이어 CRM. 제안→회신→성사 파이프라인 + 팔로업 관리.
-- 유통 확장 최우선 원칙을 플랫폼으로. 자사(owner/staff)만 접근.
-- ============================================================================

create table if not exists public.crm_leads (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'seller' check (kind in ('seller', 'buyer')), -- 셀러 공구 / 바이어 입점
  name           text not null,               -- 셀러명 / 바이어사명
  brand_id       uuid references public.brands(id) on delete set null,
  handle         text,                         -- 인스타·유튜브 핸들 / 회사 도메인
  contact        text,                         -- 연락처·이메일
  product        text,                         -- 매칭 제품
  stage          text not null default '발굴'
                 check (stage in ('발굴', '제안', '회신', '협의', '성사', '실패', '보류')),
  result         text check (result in ('won', 'lost')),
  source         text,                         -- 셀러시트 / 박람회 / DM 등
  owner_user_id  uuid references public.users(id) on delete set null,
  proposed_at    date,
  replied_at     date,
  closed_at      date,
  next_follow_up date,                          -- 다음 팔로업 예정일
  note           text,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_crm_stage on public.crm_leads(stage);
create index if not exists idx_crm_kind on public.crm_leads(kind);
create index if not exists idx_crm_follow on public.crm_leads(next_follow_up);

drop trigger if exists trg_crm_touch on public.crm_leads;
create trigger trg_crm_touch before update on public.crm_leads
  for each row execute function public.touch_updated_at();

alter table public.crm_leads enable row level security;

drop policy if exists crm_all on public.crm_leads;
create policy crm_all on public.crm_leads
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));


-- ▼▼▼ migrations/0010_pnl_snapshots.sql ▼▼▼
-- ============================================================================
-- 0010 — P&L 스냅샷. 구글 P&L 시트의 핵심 KPI를 날짜별로 저장해 추이 트래킹.
-- 자사(owner/staff)만 접근.
-- ============================================================================

create table if not exists public.pnl_snapshots (
  id            uuid primary key default gen_random_uuid(),
  snapshot_date date not null default (now() at time zone 'Asia/Seoul')::date,
  revenue       numeric,   -- 총 매출
  net_revenue   numeric,   -- 순 매출
  op_profit     numeric,   -- 영업 이익
  margin_pct    numeric,   -- 이익률(%)
  ad_cost       numeric,   -- 광고비
  roas          numeric,   -- ROAS
  refund_pct    numeric,   -- 환불률(%)
  orders        numeric,   -- 주문 건수
  aov           numeric,   -- 객단가
  raw           jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_pnl_date on public.pnl_snapshots(snapshot_date desc);

alter table public.pnl_snapshots enable row level security;

drop policy if exists pnl_all on public.pnl_snapshots;
create policy pnl_all on public.pnl_snapshots
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));


-- ▼▼▼ migrations/0011_product_shots.sql ▼▼▼
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


-- ▼▼▼ migrations/0012_task_execution.sql ▼▼▼
-- ============================================================================
-- 0012 — 집행(실행) 연결. 승인된 산출물을 업무로 넘긴 뒤, 실제 집행과 결과를
-- 한곳에서 처리하도록 tasks에 원본 산출물 링크와 집행 결과 필드를 추가한다.
-- ============================================================================

alter table public.tasks
  add column if not exists ai_output_id uuid references public.ai_outputs(id) on delete set null,
  add column if not exists exec_channel  text,   -- 집행 채널 (예: 스마트스토어, 인스타)
  add column if not exists exec_link     text,   -- 집행 결과 링크 (게시 URL 등)
  add column if not exists exec_note      text;  -- 집행 메모

create index if not exists idx_tasks_ai_output on public.tasks(ai_output_id);

-- tasks의 RLS 정책(owner/staff)은 0002에서 이미 설정됨 — 컬럼 추가는 정책 변경 불필요.


-- ▼▼▼ migrations/0013_exec_content.sql ▼▼▼
-- ============================================================================
-- 0013 — 집행 콘텐츠 생성. 승인 원문 + 실제 제품컷을 바탕으로 만든
-- 최종 게시용 콘텐츠(문구·해시태그·컷 배치)를 업무에 저장한다.
-- ============================================================================

alter table public.tasks
  add column if not exists exec_content   text,   -- 생성된 최종 게시 콘텐츠
  add column if not exists exec_gen_model  text;  -- 생성 모델


-- ▼▼▼ migrations/0014_todos.sql ▼▼▼
-- ============================================================================
-- 0014 — 업무 투두. 간단히 입력하고 팔로업하는 할 일 보드.
-- 보류/완료/취소는 '완료된 업무'로 분리해 본다.
-- owner/staff 접근.
-- ============================================================================

create table if not exists public.todos (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid references public.brands(id) on delete set null,
  title             text not null,                 -- 업무
  assignee_user_id  uuid references public.users(id) on delete set null,
  priority          text not null default '보통'
                    check (priority in ('높음', '보통', '낮음')),
  due_date          date,                          -- 마감기한
  status            text not null default '예정'
                    check (status in ('예정', '진행', '보류', '완료', '취소')),
  ref_link          text,                          -- 참고 링크
  note              text,                          -- 메모
  created_by        uuid references public.users(id) on delete set null,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_todos_status on public.todos(status);
create index if not exists idx_todos_brand on public.todos(brand_id);

alter table public.todos enable row level security;

drop policy if exists todos_all on public.todos;
create policy todos_all on public.todos
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));


-- ▼▼▼ migrations/0015_task_video.sql ▼▼▼
-- ============================================================================
-- 0015 — 집행 영상 생성(Seedance/fal). 제품컷 → 영상(image-to-video).
-- 비동기 큐 작업이라 상태·요청정보·결과 URL을 업무에 저장한다.
-- ============================================================================

alter table public.tasks
  add column if not exists video_status text,                    -- queued/processing/done/failed
  add column if not exists video_url    text,                    -- 완성 영상(Storage) URL
  add column if not exists video_meta   jsonb not null default '{}'::jsonb; -- request_id·status_url·response_url·image·prompt


-- ▼▼▼ migrations/0016_hr_shared.sql ▼▼▼
-- ============================================================================
-- 0016 — 인사(HR) 공유 테이블. 직원관리 / 연차관리.
-- 여러 사용자·기기가 같은 데이터를 공유하도록 DB로 저장한다. owner/staff 접근.
-- ============================================================================

-- ── 직원관리(직원 명부) ──────────────────────────────────────
create table if not exists public.staff_directory (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,          -- 이름
  position    text,                   -- 직책
  hire_date   date,                   -- 입사일
  salary      bigint default 0,       -- 연봉(원)
  phone       text,                   -- 연락처
  note        text,                   -- 특이사항
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.staff_directory enable row level security;
drop policy if exists staff_directory_all on public.staff_directory;
create policy staff_directory_all on public.staff_directory
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

-- ── 연차관리(연차·반차 신청) ─────────────────────────────────
create table if not exists public.leave_requests (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,          -- 직원명
  type        text not null default '연차'
              check (type in ('연차', '반차', '병가', '경조사', '기타')),
  start_date  date not null,          -- 시작일
  end_date    date,                   -- 종료일
  days        numeric not null default 1,   -- 일수(반차 0.5)
  reason      text,                   -- 사유
  status      text not null default '신청'
              check (status in ('신청', '승인', '반려')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_leave_start on public.leave_requests(start_date);

alter table public.leave_requests enable row level security;
drop policy if exists leave_requests_all on public.leave_requests;
create policy leave_requests_all on public.leave_requests
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));


-- ▼▼▼ migrations/0017_leave.sql ▼▼▼
-- ============================================================================
-- 0016 — 연차관리대장. 근로기준법 제60조 기준(입사연도 월 1일, 1년+ 15일+근속가산).
-- 부여일수·월별 사용·잔여는 앱에서 자동 계산. owner/staff 접근.
-- ============================================================================

create table if not exists public.leave_members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,               -- 성명
  join_date   date not null,               -- 입사일
  carryover   numeric not null default 0,  -- 이월(수동)
  note        text,
  active      boolean not null default true,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_leave_members_active on public.leave_members(active);

create table if not exists public.leave_usages (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.leave_members(id) on delete cascade,
  use_date    date not null,               -- 사용일자
  type        text not null default '연차'
              check (type in ('연차', '반차(오전)', '반차(오후)')),
  approver    text,                         -- 승인
  note        text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_leave_usages_member on public.leave_usages(member_id);
create index if not exists idx_leave_usages_date on public.leave_usages(use_date);

alter table public.leave_members enable row level security;
alter table public.leave_usages enable row level security;

drop policy if exists leave_members_all on public.leave_members;
create policy leave_members_all on public.leave_members
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

drop policy if exists leave_usages_all on public.leave_usages;
create policy leave_usages_all on public.leave_usages
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));


-- ▼▼▼ migrations/0018_ops_folders.sql ▼▼▼
-- 0018_ops_folders.sql
-- 경영지원매니저 업무일지 / 계정 ID·PW / 제품 이미지·영상 자료 폴더

-- 경영지원매니저 일일 업무일지
create table if not exists public.manager_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  category text not null,
  task text not null,
  status text not null default '예정',
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists manager_logs_date_idx on public.manager_logs(log_date desc);

-- 월간 성과·인센티브 트래커 (공구·프로모션 매출 → 인센티브 자동계산)
create table if not exists public.manager_incentives (
  id uuid primary key default gen_random_uuid(),
  month text not null unique,               -- YYYY-MM
  gonggu_count integer not null default 0,
  gonggu_sales bigint not null default 0,
  promo_sales bigint not null default 0,
  rate_pct numeric not null default 5,
  note text,
  updated_at timestamptz not null default now()
);

-- 계정 ID·PW 금고 (스마트스토어·쿠팡 등 운영 계정)
create table if not exists public.app_accounts (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  purpose text,
  login_id text,
  password text,
  url text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 제품 이미지·영상 자료 (외부 링크 레지스트리)
create table if not exists public.product_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default '이미지',       -- 이미지 / 영상
  brand text,
  link text,
  thumb_url text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.manager_logs       enable row level security;
alter table public.manager_incentives enable row level security;
alter table public.app_accounts        enable row level security;
alter table public.product_assets      enable row level security;

drop policy if exists manager_logs_all on public.manager_logs;
create policy manager_logs_all on public.manager_logs for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

drop policy if exists manager_incentives_all on public.manager_incentives;
create policy manager_incentives_all on public.manager_incentives for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

drop policy if exists app_accounts_all on public.app_accounts;
create policy app_accounts_all on public.app_accounts for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

drop policy if exists product_assets_all on public.product_assets;
create policy product_assets_all on public.product_assets for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0019_receivables.sql ▼▼▼
-- 0019_receivables.sql — 미수금 내역

create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  counterparty text not null,          -- 거래처
  item text,                            -- 항목/내용
  billed bigint not null default 0,     -- 청구액
  received bigint not null default 0,   -- 입금액
  bill_date date,                       -- 청구일
  due_date date,                        -- 입금예정일
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists receivables_due_idx on public.receivables(due_date);

alter table public.receivables enable row level security;
drop policy if exists receivables_all on public.receivables;
create policy receivables_all on public.receivables for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0020_payables.sql ▼▼▼
-- 0020_payables.sql — 미지급금 내역 (거래처에 지급해야 할 금액)

create table if not exists public.payables (
  id uuid primary key default gen_random_uuid(),
  counterparty text not null,          -- 거래처
  item text,                            -- 항목/내용
  amount bigint not null default 0,     -- 지급 예정액(청구받은 금액)
  paid bigint not null default 0,       -- 지급액
  bill_date date,                       -- 청구일(세금계산서 등)
  due_date date,                        -- 지급 예정일
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payables_due_idx on public.payables(due_date);

alter table public.payables enable row level security;
drop policy if exists payables_all on public.payables;
create policy payables_all on public.payables for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0021_store_shared.sql ▼▼▼
-- ============================================================================
-- 0021 — F&B/다이닝 플랫폼 공유 데이터. 거래처(store_vendors)·온라인 주문처(store_order_links).
-- /fnb, /dining 은 공개(비로그인) 플랫폼이라 서버 액션(service_role)으로만 읽고 쓴다.
-- RLS 활성 + 정책 없음 → anon/authenticated 직접 접근 차단, service_role만 우회 접근.
-- platform: 'fnb' | 'dining', store: 매장 id 문자열(chdo/euwb/sbgb/smjp/dwmc).
-- ============================================================================

create table if not exists public.store_vendors (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null,
  store       text not null,
  cat         text not null default '식자재',
  name        text not null,
  contact     text,
  phone       text,
  items       text,
  terms       text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_store_vendors_pf on public.store_vendors(platform);
alter table public.store_vendors enable row level security;

create table if not exists public.store_order_links (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null,
  store       text not null,
  cat         text not null default '기타',
  name        text not null,
  url         text not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_store_links_pf on public.store_order_links(platform);
alter table public.store_order_links enable row level security;


-- ▼▼▼ migrations/0022_store_meetings.sql ▼▼▼
-- ============================================================================
-- 0022 — F&B/다이닝 플랫폼 미팅·회의 일지(store_meetings).
-- /fnb, /dining 공개 플랫폼 → 서버 액션(service_role)으로만 접근. platform/store로 구분.
-- 첨부파일은 기존 공개 버킷 'generated-media' 재사용(별도 생성 불필요).
-- AI 정리 결과는 ai_summary에 저장.
-- ============================================================================

create table if not exists public.store_meetings (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null,
  store         text not null default 'all',
  title         text not null,
  meeting_type  text not null default '내부',
  meeting_date  date,
  attendees     text,
  location      text,
  body          text,
  ai_summary    text,
  file_path     text,
  file_name     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_store_meetings_pf on public.store_meetings(platform, meeting_date desc);
alter table public.store_meetings enable row level security;
-- 정책 없음 → service_role(서버 액션)만 접근. anon 직접 접근 차단.


-- ▼▼▼ migrations/0023_meetings.sql ▼▼▼
-- 0021_meetings.sql — 미팅·회의 일지
-- 첨부파일은 기존 공개 버킷 'generated-media' (meeting-files/ 경로)를 재사용한다.

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_type text not null default '내부',   -- 외부 / 내부
  meeting_date date,
  attendees text,
  location text,
  body text,                                    -- 직접 작성한 원문
  ai_summary text,                              -- AI가 정리한 회의록
  file_path text,                               -- generated-media 내 경로
  file_name text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_date_idx on public.meetings(meeting_date desc);

alter table public.meetings enable row level security;
drop policy if exists meetings_all on public.meetings;
create policy meetings_all on public.meetings for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0024_storage_meetings.sql ▼▼▼
-- 0024_storage_meetings.sql
-- 미팅 첨부파일을 브라우저에서 직접 업로드할 수 있도록 storage 권한을 연다.
-- (기존 generated-media 공개 버킷 재사용. 서버 우회 → 대용량·모바일 사진/녹음 업로드 가능)

insert into storage.buckets (id, name, public)
values ('generated-media', 'generated-media', true)
on conflict (id) do update set public = true;

-- 로그인(authenticated) 사용자는 업로드 가능
drop policy if exists "media_auth_insert" on storage.objects;
create policy "media_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'generated-media');

drop policy if exists "media_auth_update" on storage.objects;
create policy "media_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'generated-media')
  with check (bucket_id = 'generated-media');

-- 누구나 읽기(공개 URL)
drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects
  for select to public
  using (bucket_id = 'generated-media');


-- ▼▼▼ migrations/0025_store_assets.sql ▼▼▼
-- ============================================================================
-- 0025 — F&B/다이닝 자료실 업로드 파일(store_assets).
-- 사용자가 직접 올린 디자인·메뉴·포스터·영상·문서 파일 메타데이터. 파일은 공개 버킷
-- 'generated-media'에 저장(asset-files/...). service_role 서버 액션으로만 접근.
-- ============================================================================

create table if not exists public.store_assets (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null,
  store       text not null default 'all',
  section     text not null default 'design',   -- design/menu/poster/video/plan
  title       text,
  file_name   text not null,
  file_path   text not null,
  kind        text not null default 'doc',       -- image/video/doc
  created_at  timestamptz not null default now()
);
create index if not exists idx_store_assets_pf on public.store_assets(platform, store);
alter table public.store_assets enable row level security;
-- 정책 없음 → service_role(서버 액션)만 접근.


-- ▼▼▼ migrations/0026_uno_state.sql ▼▼▼
-- ============================================================================
-- 0022 — UNO 자기 관리 플랫폼 상태 저장.
-- /uno 는 공개(비로그인) 개인 도구라, 서버 액션(service_role)으로만 읽고 쓴다.
-- 상태 전체를 단일 행(jsonb)으로 저장 → 모든 기기가 같은 데이터를 공유(자동 동기화).
-- RLS 활성 + 정책 없음 → anon/authenticated 직접 접근 차단, service_role만 우회 접근.
-- ============================================================================

create table if not exists public.uno_state (
  id          text primary key default 'default',
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.uno_state enable row level security;


-- ▼▼▼ migrations/0028_payables_recurring.sql ▼▼▼
-- 0028_payables_recurring.sql — 미지급금 정기 지급(원금·이자·주기·종료일)
alter table public.payables add column if not exists principal bigint not null default 0;      -- 원금
alter table public.payables add column if not exists interest bigint not null default 0;       -- 이자
alter table public.payables add column if not exists component text;                            -- 원금 / 이자 / 원금+이자
alter table public.payables add column if not exists frequency text not null default '없음';    -- 없음 / 매일 / 매주 / 매월
alter table public.payables add column if not exists period_amount bigint not null default 0;   -- 회차(정기) 지급액
alter table public.payables add column if not exists has_end boolean not null default false;    -- 종료일 있음/없음
alter table public.payables add column if not exists end_date date;                             -- 종료일


-- ▼▼▼ migrations/0029_daily_checks.sql ▼▼▼
-- 0029_daily_checks.sql — 일일 체크리스트(운영 현황)
create table if not exists public.daily_checks (
  check_date date not null,
  item_key text not null,
  done boolean not null default false,
  note text,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (check_date, item_key)
);
alter table public.daily_checks enable row level security;
drop policy if exists daily_checks_all on public.daily_checks;
create policy daily_checks_all on public.daily_checks for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0030_todo_multi_assignee.sql ▼▼▼
-- ============================================================================
-- 0030 — 전직원 투두 다중 담당자. 한 업무에 담당자를 여러 명 지정할 수 있게 한다.
-- 기존 단일 담당자(assignee_user_id)는 그대로 두고 배열 컬럼을 추가·백필한다.
-- ============================================================================

alter table public.todos
  add column if not exists assignee_user_ids uuid[] not null default '{}'::uuid[];

-- 기존 단일 담당자를 배열로 백필(배열이 비어 있는 행만).
update public.todos
  set assignee_user_ids = array[assignee_user_id]
  where assignee_user_id is not null
    and coalesce(cardinality(assignee_user_ids), 0) = 0;

create index if not exists idx_todos_assignees
  on public.todos using gin(assignee_user_ids);


-- ▼▼▼ migrations/0031_task_thumbs.sql ▼▼▼
-- ============================================================================
-- 0031 — 집행 썸네일 이미지. 업무별로 생성한 썸네일 이미지 URL 목록을 저장한다.
-- (영상보다 훨씬 저렴한 이미지 생성으로 대체)
-- ============================================================================

alter table public.tasks
  add column if not exists thumb_urls jsonb not null default '[]'::jsonb;


-- ▼▼▼ migrations/0032_todo_file.sql ▼▼▼
-- ============================================================================
-- 0032 — 전직원 투두 파일 첨부. (링크는 기존 ref_link 사용)
-- ============================================================================

alter table public.todos
  add column if not exists file_url  text,
  add column if not exists file_name text;


-- ▼▼▼ migrations/0033_todo_files.sql ▼▼▼
-- ============================================================================
-- 0033 — 전직원 투두 다중 파일 첨부. files: [{url, name}, ...]
-- 기존 단일 file_url/file_name은 조회 시 함께 병합해 보여준다(백필 불필요).
-- ============================================================================

alter table public.todos
  add column if not exists files jsonb not null default '[]'::jsonb;


-- ▼▼▼ migrations/0034_settle.sql ▼▼▼
-- ============================================================================
-- 0034 — 미지급/미수금 완료 처리. settled_at(완료 시각) 추가.
-- null = 미완료(진행), 값 있음 = 완료(지급완료/수금완료).
-- ============================================================================

alter table public.payables    add column if not exists settled_at timestamptz;
alter table public.receivables add column if not exists settled_at timestamptz;


-- ▼▼▼ migrations/0035_ceo_todos.sql ▼▼▼
-- ============================================================================
-- 0035 — CEO 투두 DB화(기기 간 동기화). 기존 localStorage → 서버 공유.
-- 대표(owner) 개인 보드이므로 owner만 접근.
-- ============================================================================

create table if not exists public.ceo_todos (
  id         text primary key,                     -- 클라이언트 생성 id 유지
  no         int,
  cat        text,
  text       text not null,
  pri        text not null default '최우선',
  done       boolean not null default false,
  link       text,
  files      jsonb not null default '[]'::jsonb,
  src        text,                                 -- 전직원 투두 이관 원본 id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ceo_todos enable row level security;
drop policy if exists ceo_todos_owner on public.ceo_todos;
create policy ceo_todos_owner on public.ceo_todos
  for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');


-- ▼▼▼ migrations/0036_leave_status.sql ▼▼▼
-- ============================================================================
-- 0036 — 연차 신청 승인 흐름. leave_usages 에 status 추가.
-- 직원이 신청하면 pending, 대표가 승인하면 approved(잔여에서 차감), 반려는 rejected.
-- 기존 기록은 approved 로 간주(default 'approved').
-- ============================================================================

alter table public.leave_usages
  add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));

-- 신청자/결재자 기록(선택)
alter table public.leave_usages add column if not exists requested_by uuid references public.users(id) on delete set null;
alter table public.leave_usages add column if not exists decided_by uuid references public.users(id) on delete set null;
alter table public.leave_usages add column if not exists decided_at timestamptz;


-- ▼▼▼ migrations/0037_todo_sort_order.sql ▼▼▼
-- ============================================================================
-- 0037 — 투두 수동 정렬. 우선순위(그룹) 안에서 위/아래로 순서 조정.
-- ============================================================================

alter table public.ceo_todos add column if not exists sort_order int not null default 0;
alter table public.todos     add column if not exists sort_order int not null default 0;

create index if not exists ceo_todos_sort_idx on public.ceo_todos(sort_order);
create index if not exists todos_sort_idx on public.todos(sort_order);


-- ▼▼▼ migrations/0038_todo_pinned.sql ▼▼▼
-- ============================================================================
-- 0038 — 투두 상단 고정(pin). 고정한 항목은 그룹 최상단에 유지.
-- ============================================================================

alter table public.ceo_todos add column if not exists pinned boolean not null default false;
alter table public.todos     add column if not exists pinned boolean not null default false;


-- ▼▼▼ migrations/0039_inventory_movements.sql ▼▼▼
-- ============================================================================
-- 0039 — 재고관리 강화. 입고/출고 이동 기록(inventory_movements).
-- inventory_items 는 0005 에서 이미 생성됨. 여기서는 조정 이력 로그를 추가한다.
-- ============================================================================

create table if not exists public.inventory_movements (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid references public.inventory_items(id) on delete cascade,
  kind         text not null default 'out' check (kind in ('in', 'out', 'adjust')),
  qty          numeric not null default 0,      -- 이동 수량(입고 +, 출고 -, 조정은 목표값과의 차이)
  balance      numeric,                          -- 이동 직후 현재고(스냅샷)
  note         text,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists inv_mov_item_idx on public.inventory_movements(item_id);
create index if not exists inv_mov_time_idx on public.inventory_movements(created_at);

alter table public.inventory_movements enable row level security;
drop policy if exists inv_mov_all on public.inventory_movements;
create policy inv_mov_all on public.inventory_movements for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

-- inventory_items 도 owner/staff 가 직접 편집할 수 있도록 정책 보강(이미 있으면 교체)
drop policy if exists inventory_items_all on public.inventory_items;
create policy inventory_items_all on public.inventory_items for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0040_product_dev.sql ▼▼▼
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


-- ▼▼▼ migrations/0041_inventory_dates.sql ▼▼▼
-- ============================================================================
-- 0041 — 재고 품목에 생산일·유효기간 추가.
-- ============================================================================

alter table public.inventory_items add column if not exists production_date date;
alter table public.inventory_items add column if not exists expiry_date date;
create index if not exists inv_items_expiry_idx on public.inventory_items(expiry_date);


-- ▼▼▼ migrations/0042_product_dev_files.sql ▼▼▼
-- ============================================================================
-- 0042 — 제품개발 다중 첨부파일. product_developments.files (jsonb 배열).
-- ============================================================================

alter table public.product_developments
  add column if not exists files jsonb not null default '[]'::jsonb;


-- ▼▼▼ migrations/0043_todo_progress_comments.sql ▼▼▼
-- ============================================================================
-- 0043 — 업무 협업 고도화(플로우 레퍼런스).
--   1) todos.progress : 진행률(0~100)
--   2) todo_comments   : 업무별 댓글·멘션 스레드
-- ============================================================================

alter table public.todos add column if not exists progress int not null default 0;

create table if not exists public.todo_comments (
  id          uuid primary key default gen_random_uuid(),
  todo_id     uuid not null references public.todos(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  body        text not null,
  mentions    uuid[] not null default '{}'::uuid[],
  created_at  timestamptz not null default now()
);
create index if not exists todo_comments_todo_idx on public.todo_comments(todo_id);
create index if not exists todo_comments_time_idx on public.todo_comments(created_at);

alter table public.todo_comments enable row level security;
drop policy if exists todo_comments_all on public.todo_comments;
create policy todo_comments_all on public.todo_comments for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));


-- ▼▼▼ migrations/0044_notifications.sql ▼▼▼
-- ============================================================================
-- 0044 — 통합 알림센터 + 모바일 웹푸시(플로우 레퍼런스).
--   notifications        : 인앱 알림(내 업무 배정/멘션/마감 등)
--   push_subscriptions   : PWA 웹푸시 구독 정보
-- ============================================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,  -- 받는 사람
  type        text not null default 'general',   -- todo_assigned|mention|todo_due|leave|general
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notif_user_time_idx on public.notifications(user_id, created_at desc);
create index if not exists notif_user_unread_idx on public.notifications(user_id, read_at);

alter table public.notifications enable row level security;
-- 본인 알림만 조회/수정(읽음 처리). 생성은 서버(service role)가 담당.
drop policy if exists notif_select_own on public.notifications;
create policy notif_select_own on public.notifications for select to authenticated
  using (user_id = public.current_user_id());
drop policy if exists notif_update_own on public.notifications;
create policy notif_update_own on public.notifications for update to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());
drop policy if exists notif_delete_own on public.notifications;
create policy notif_delete_own on public.notifications for delete to authenticated
  using (user_id = public.current_user_id());

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists push_sub_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_sub_own on public.push_subscriptions;
create policy push_sub_own on public.push_subscriptions for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());


-- ▼▼▼ migrations/0045_approval_requests.sql ▼▼▼
-- ============================================================================
-- 0045 — 전자결재(결재선) 일반화. 지출결의·발주·일반 기안을 대표가 승인/반려.
--   (연차는 기존 leave_usages 승인 흐름을 그대로 사용)
-- ============================================================================

create table if not exists public.approval_requests (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default '일반',   -- 지출결의 | 발주 | 일반
  title          text not null,
  amount         bigint,                          -- 금액(있으면)
  body           text,                            -- 상세 내용
  files          jsonb not null default '[]'::jsonb,
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  requester_id   uuid references public.users(id) on delete set null,
  decided_by     uuid references public.users(id) on delete set null,
  decided_at     timestamptz,
  decision_note  text,                            -- 반려/승인 사유
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists approval_req_status_idx on public.approval_requests(status);
create index if not exists approval_req_time_idx on public.approval_requests(created_at desc);

alter table public.approval_requests enable row level security;

-- 조회·기안: owner/staff. 결재(수정)·삭제: owner 전용.
drop policy if exists approval_req_select on public.approval_requests;
create policy approval_req_select on public.approval_requests for select to authenticated
  using (public.current_app_role() in ('owner','staff'));
drop policy if exists approval_req_insert on public.approval_requests;
create policy approval_req_insert on public.approval_requests for insert to authenticated
  with check (public.current_app_role() in ('owner','staff'));
drop policy if exists approval_req_update on public.approval_requests;
create policy approval_req_update on public.approval_requests for update to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
drop policy if exists approval_req_delete on public.approval_requests;
create policy approval_req_delete on public.approval_requests for delete to authenticated
  using (public.current_app_role() = 'owner');


-- ▼▼▼ migrations/0046_ceo_todo_due.sql ▼▼▼
-- ============================================================================
-- 0046 — CEO 투두 마감일. 3일 전·당일 알림(이메일+모바일)에 사용.
-- ============================================================================

alter table public.ceo_todos add column if not exists due_date date;
create index if not exists ceo_todos_due_idx on public.ceo_todos(due_date);


-- ▼▼▼ migrations/0047_audit_logs.sql ▼▼▼
-- ============================================================================
-- 0047 — 변경 이력(감사 로그). 주요 생성/수정/삭제/결재를 기록. 대표만 조회.
-- ============================================================================

create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.users(id) on delete set null,
  actor_name   text,                 -- 기록 시점 이름(계정 삭제돼도 남게 비정규화)
  action       text not null,        -- created | updated | deleted | status | approved | rejected
  entity       text not null,        -- todo | ceo_todo | approval | leave | inventory | product_dev | assignee
  entity_label text,                 -- 대상 제목/이름
  detail       text,                 -- 부가 설명
  created_at   timestamptz not null default now()
);
create index if not exists audit_logs_time_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id);

alter table public.audit_logs enable row level security;
-- 조회는 대표만. 기록(insert)은 서버(service role)가 담당.
drop policy if exists audit_logs_owner_select on public.audit_logs;
create policy audit_logs_owner_select on public.audit_logs for select to authenticated
  using (public.current_app_role() = 'owner');


-- ▼▼▼ migrations/0048_realtime.sql ▼▼▼
-- ============================================================================
-- 0048 — 실시간 반영. 주요 테이블을 supabase_realtime 퍼블리케이션에 추가.
--   (이미 추가돼 있으면 건너뛴다. 미실행 시엔 기존 폴링/수동 새로고침으로 동작)
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array['todos','todo_comments','notifications','ceo_todos','approval_requests'];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ▼▼▼ migrations/0049_partner_guest.sql ▼▼▼
-- ============================================================================
-- 0049 — 파트너(게스트) 협업. guest 권한 + 파트너 협업 게시판.
--   게스트는 화이트리스트(파트너 협업 + 제품 이미지·영상 자료)만 접근.
-- ============================================================================

-- 1) guest 역할 추가(enum). 이미 있으면 무시.
alter type app_role add value if not exists 'guest';

-- 2) 파트너 협업 게시판: 대표/직원이 파일·링크·메모를 올리고 게스트는 열람.
create table if not exists public.partner_posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  link        text,
  files       jsonb not null default '[]'::jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists partner_posts_time_idx on public.partner_posts(created_at desc);

alter table public.partner_posts enable row level security;
-- 열람: 대표·직원·게스트. 작성/삭제: 대표·직원만.
drop policy if exists partner_posts_select on public.partner_posts;
create policy partner_posts_select on public.partner_posts for select to authenticated
  using (public.current_app_role() in ('owner','staff','guest'));
-- 작성(insert): 대표·직원·게스트 모두 가능.
drop policy if exists partner_posts_write on public.partner_posts;
drop policy if exists partner_posts_insert on public.partner_posts;
create policy partner_posts_insert on public.partner_posts for insert to authenticated
  with check (public.current_app_role() in ('owner','staff','guest'));
-- 수정(update): 대표·직원.
drop policy if exists partner_posts_update on public.partner_posts;
create policy partner_posts_update on public.partner_posts for update to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
-- 삭제(delete): 대표·직원 전체, 게스트는 본인 글만.
drop policy if exists partner_posts_delete on public.partner_posts;
create policy partner_posts_delete on public.partner_posts for delete to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or (public.current_app_role() = 'guest' and created_by = public.current_user_id())
  );

-- 3) 제품 이미지·영상 자료(product_assets)를 게스트도 '열람'할 수 있도록 SELECT 정책 추가(가산 정책).
drop policy if exists product_assets_guest_select on public.product_assets;
create policy product_assets_guest_select on public.product_assets for select to authenticated
  using (public.current_app_role() in ('owner','staff','guest'));


