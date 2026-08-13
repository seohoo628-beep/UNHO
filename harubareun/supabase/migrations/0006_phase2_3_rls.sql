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
