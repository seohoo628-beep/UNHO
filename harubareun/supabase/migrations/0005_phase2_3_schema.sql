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
