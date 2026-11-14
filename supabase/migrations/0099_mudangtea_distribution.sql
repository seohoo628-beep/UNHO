-- 0099_mudangtea_distribution.sql — 무당티 유통 관리(판매처·제안, 판매, 로트·유통기한, 배송비, 가격 설정)
-- 가격·거래처 데이터는 이 파일에 넣지 않는다(공개 저장소). 화면 또는 사내 전용 스크립트로 입력한다.
-- 여러 번 실행해도 안전하다.

create table if not exists public.mdt_settings (
  id text primary key default 'main',
  supply_price_incl bigint,            -- 공급가(박스당, VAT 포함, 원)
  vat_rate numeric not null default 0.1,
  retail_price bigint,                 -- 권장 소비자가(박스당, 원)
  ship_per_carton bigint,              -- 배송비(1건당, 원)
  boxes_per_carton int,                -- 1건(카톤)당 박스 수
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists public.mdt_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text,
  stage text not null default '발굴'
    check (stage in ('발굴','제안','샘플','협상','입점','판매중','보류','종료')),
  deal_type text check (deal_type is null or deal_type in ('사입','위탁')),
  sale_price bigint,                   -- 판매처 공급가(박스당, VAT 별도)
  contact text,
  next_action text,
  next_date date,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mdt_lots (
  id uuid primary key default gen_random_uuid(),
  lot_no text not null,
  received_date date,
  expiry date not null,
  qty_in int not null check (qty_in > 0),
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mdt_sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null,
  account_id uuid not null references public.mdt_accounts(id) on delete restrict,
  lot_id uuid references public.mdt_lots(id) on delete restrict,
  qty int not null check (qty > 0),    -- 박스
  unit_price bigint not null,          -- 박스당, VAT 별도
  ship_cost bigint,                    -- 배송비(원)
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mdt_sales_date_idx on public.mdt_sales(sale_date);
create index if not exists mdt_sales_account_idx on public.mdt_sales(account_id);

create table if not exists public.mdt_shipments (
  id uuid primary key default gen_random_uuid(),
  ship_date date not null,
  kind text not null default '샘플' check (kind in ('샘플','반품','재발송','기타')),
  account_id uuid references public.mdt_accounts(id) on delete set null,
  cost bigint not null,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['mdt_settings','mdt_accounts','mdt_lots','mdt_sales','mdt_shipments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (public.current_app_role() in ('owner','staff'))
      with check (public.current_app_role() in ('owner','staff'))$p$, t || '_all', t);
  end loop;
end $$;
