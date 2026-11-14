-- 0097_tax_invoice_ledger.sql — 매출 세금계산서 발행 자동화용 장부 정비
--
-- 1) vendors: 매출처(공급받는자)로도 쓰기 위해 사업자등록증 항목 중 빠진 업태·종목과
--    세금계산서 수신 이메일을 추가한다. 사업자번호·대표자·주소는 기존 열을 쓴다.
-- 2) receivables: 한 행 = 세금계산서 품목 1개가 되도록 공급자 법인, 매출처, 공급일,
--    수량·단가·공급가액, 과세유형, 영수/청구, 발행 결과(승인번호·발행일)를 추가한다.
--    billed(청구액)는 기존대로 부가세 포함 수금 대상 금액이다.

alter table public.vendors add column if not exists biz_type  text;  -- 업태
alter table public.vendors add column if not exists biz_item  text;  -- 종목
alter table public.vendors add column if not exists tax_email text;  -- 세금계산서 수신 이메일

alter table public.receivables add column if not exists supplier      text;   -- 공급자 법인: 운호컴퍼니 / 뷰티밤
alter table public.receivables add column if not exists vendor_id     uuid references public.vendors(id) on delete set null;
alter table public.receivables add column if not exists supply_date   date;   -- 공급일(작성일자). 월합계는 그 달 말일
alter table public.receivables add column if not exists quantity      numeric;
alter table public.receivables add column if not exists unit_price    bigint; -- 원
alter table public.receivables add column if not exists supply_amount bigint; -- 공급가액(원, 부가세 별도)
alter table public.receivables add column if not exists tax_type      text not null default '과세';
alter table public.receivables add column if not exists invoice_kind  text not null default '청구';
alter table public.receivables add column if not exists invoice_no    text;   -- 국세청 승인번호
alter table public.receivables add column if not exists invoice_issued_at date;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'receivables_supplier_chk') then
    alter table public.receivables add constraint receivables_supplier_chk
      check (supplier is null or supplier in ('운호컴퍼니', '뷰티밤'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'receivables_tax_type_chk') then
    alter table public.receivables add constraint receivables_tax_type_chk
      check (tax_type in ('과세', '영세', '면세'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'receivables_invoice_kind_chk') then
    alter table public.receivables add constraint receivables_invoice_kind_chk
      check (invoice_kind in ('청구', '영수'));
  end if;
end $$;

create index if not exists receivables_supply_date_idx on public.receivables(supply_date);
create index if not exists receivables_vendor_idx on public.receivables(vendor_id);
