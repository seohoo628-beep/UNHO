-- ============================================================================
-- 0105 — 계약서 관리 + 거래명세서 작성·발급.
-- 1) contracts: 계약 당사자·유형·기간·금액·상태·자동갱신·파일(비공개 저장소)
-- 2) trade_statements: 거래명세서(품목 여러 줄, 합계, 문서번호, 팝빌 전자명세서 발행 기록)
-- 3) storage 'contracts' 비공개 버킷: 로그인한 자사 직원만 업로드·조회(열람은 서버가 30초 서명 URL 발급)
-- 재실행 안전.
-- ============================================================================

create table if not exists public.contracts (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  counterparty  text not null,
  vendor_id     uuid references public.vendors(id) on delete set null,
  our_party     text not null default '운호컴퍼니',  -- 운호컴퍼니 / 뷰티밤 / 기타
  kind          text not null default '기타',        -- 공급·유통·위탁생산(OEM)·용역·NDA·임대·근로·투자·기타
  status        text not null default '체결' check (status in ('검토중', '체결', '만료', '해지')),
  signed_date   date,
  start_date    date,
  end_date      date,
  auto_renew    boolean not null default false,
  notice_days   int not null default 30,            -- 만료 며칠 전에 알릴지
  amount        bigint,                             -- 계약 금액(원, 없으면 비움)
  terms         text,                               -- 핵심 조건 요약(대금·납기·해지 조항 등)
  files         jsonb not null default '[]'::jsonb, -- [{path, name, size}]
  note          text,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists contracts_end_idx on public.contracts(end_date);
alter table public.contracts enable row level security;
drop policy if exists contracts_all on public.contracts;
create policy contracts_all on public.contracts for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

create table if not exists public.trade_statements (
  id               uuid primary key default gen_random_uuid(),
  doc_no           text not null unique,             -- TS-20261116-001
  supplier         text not null default '운호컴퍼니' check (supplier in ('운호컴퍼니', '뷰티밤')),
  vendor_id        uuid references public.vendors(id) on delete set null,
  receiver_name    text not null,
  receiver_biz_no  text,
  receiver_ceo     text,
  receiver_address text,
  receiver_email   text,
  issue_date       date not null default current_date,
  tax_type         text not null default '과세' check (tax_type in ('과세', '영세', '면세')),
  items            jsonb not null default '[]'::jsonb, -- [{name, spec, qty, unit_price, supply, tax}]
  supply_total     bigint not null default 0,
  tax_total        bigint not null default 0,
  total            bigint not null default 0,
  note             text,
  status           text not null default '작성' check (status in ('작성', '발급', '취소')),
  popbill_mgt_key  text,
  issued_at        timestamptz,
  receivable_id    uuid references public.receivables(id) on delete set null,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists trade_statements_date_idx on public.trade_statements(issue_date desc);
alter table public.trade_statements enable row level security;
drop policy if exists trade_statements_all on public.trade_statements;
create policy trade_statements_all on public.trade_statements for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

-- 계약서 파일: 비공개 버킷
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do update set public = false;

drop policy if exists "contracts_auth_insert" on storage.objects;
create policy "contracts_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contracts' and public.current_app_role() in ('owner', 'staff'));
drop policy if exists "contracts_auth_select" on storage.objects;
create policy "contracts_auth_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'contracts' and public.current_app_role() in ('owner', 'staff'));
drop policy if exists "contracts_auth_delete" on storage.objects;
create policy "contracts_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'contracts' and public.current_app_role() in ('owner', 'staff'));
