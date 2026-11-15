-- ============================================================================
-- 0102 — 플랫폼 고도화: AI 직원 검토 루프 + CS·출고 데이터 + 공구 CRM 보장.
-- 1) AI 정기업무 결과 검토(승인/반려)와 반려 사유를 다음 실행 지시에 반영
-- 2) CS 문의·출고 내역 테이블(엑셀·CSV 붙여넣기로 입력) → CS·물류 AI가 읽는다
-- 3) crm_leads(0009)가 빠진 환경을 위해 같은 정의를 다시 보장(재실행 안전)
-- ============================================================================

-- ── 1. AI 결과 검토 ─────────────────────────────────────────────────────────
alter table public.todos
  add column if not exists agent_review      text check (agent_review is null or agent_review in ('승인', '반려')),
  add column if not exists agent_review_note text,
  add column if not exists agent_reviewed_at timestamptz,
  add column if not exists agent_reject_count int not null default 0; -- 반려 누적(재실행돼도 남는다)
alter table public.agent_routines
  add column if not exists feedback text; -- 최근 반려 사유(최신 5건), 실행 프롬프트에 붙는다

-- ── 2. CS 문의 ──────────────────────────────────────────────────────────────
create table if not exists public.cs_inquiries (
  id           uuid primary key default gen_random_uuid(),
  received_at  date not null default current_date,
  channel      text,                          -- 스마트스토어·카카오채널·쿠팡·자사몰·전화 등
  brand        text,
  customer     text,
  order_no     text,
  category     text,                          -- 배송·교환·환불·제품문의·클레임 등
  content      text not null,
  status       text not null default '미처리' check (status in ('미처리', '처리중', '완료')),
  answer       text,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists cs_inquiries_status_idx on public.cs_inquiries(status, received_at desc);
alter table public.cs_inquiries enable row level security;
drop policy if exists cs_inquiries_all on public.cs_inquiries;
create policy cs_inquiries_all on public.cs_inquiries for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

-- ── 3. 출고 내역 ────────────────────────────────────────────────────────────
create table if not exists public.shipments (
  id           uuid primary key default gen_random_uuid(),
  ship_date    date not null default current_date,
  channel      text,                          -- 판매 채널·거래처
  brand        text,
  order_no     text,
  item         text not null,
  qty          numeric not null default 1,
  carrier      text,                          -- 택배사·3PL
  tracking_no  text,
  status       text not null default '출고' check (status in ('출고', '배송중', '배송완료', '반품', '지연')),
  note         text,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists shipments_date_idx on public.shipments(ship_date desc);
create unique index if not exists shipments_tracking_uidx on public.shipments(carrier, tracking_no) where tracking_no is not null and tracking_no <> '';
alter table public.shipments enable row level security;
drop policy if exists shipments_all on public.shipments;
create policy shipments_all on public.shipments for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

-- ── 4. CS·물류 AI가 새 데이터를 읽도록 ───────────────────────────────────────
update public.agent_routines set context_keys = '{cs_inquiries,reviews,todos}'
 where agent_key = 'cs-manager' and title = 'CS 문의·리뷰 동향 점검';
update public.agent_routines set context_keys = '{shipments,purchase_orders,inventory}'
 where agent_key = 'logistics-manager' and title = '입고·출고·재고 이동 점검';

-- ── 5. 공구 CRM(0009 재보장) ────────────────────────────────────────────────
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
