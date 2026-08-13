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
