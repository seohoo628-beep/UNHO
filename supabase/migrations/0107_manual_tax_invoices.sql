-- ============================================================================
-- 0107 — 미수금과 별개로 직접 입력해 발행하는 전자세금계산서.
-- 품목 여러 줄, 공급받는자 정보 스냅샷, 팝빌 발행 결과(승인번호·관리번호·오류)를 보관. 재실행 안전.
-- ============================================================================
create table if not exists public.manual_tax_invoices (
  id               uuid primary key default gen_random_uuid(),
  supplier         text not null default '운호컴퍼니' check (supplier in ('운호컴퍼니', '뷰티밤')),
  vendor_id        uuid references public.vendors(id) on delete set null,
  buyer_name       text not null,
  buyer_biz_no     text,
  buyer_ceo        text,
  buyer_address    text,
  buyer_biz_type   text,
  buyer_biz_item   text,
  buyer_email      text,
  write_date       date not null default current_date,
  tax_type         text not null default '과세' check (tax_type in ('과세', '영세', '면세')),
  purpose          text not null default '청구' check (purpose in ('청구', '영수')),
  items            jsonb not null default '[]'::jsonb, -- [{name, spec, qty, unit_price, supply, tax}]
  supply_total     bigint not null default 0,
  tax_total        bigint not null default 0,
  total            bigint not null default 0,
  note             text,
  status           text not null default '작성' check (status in ('작성', '발행', '취소')),
  nts_confirm_num  text,
  popbill_mgt_key  text unique,
  issue_error      text,
  issued_at        timestamptz,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists manual_tax_invoices_date_idx on public.manual_tax_invoices(write_date desc);
alter table public.manual_tax_invoices enable row level security;
drop policy if exists manual_tax_invoices_all on public.manual_tax_invoices;
create policy manual_tax_invoices_all on public.manual_tax_invoices for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
