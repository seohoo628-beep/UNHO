-- ============================================================================
-- 0007 — AI 자동 생성 대상 전체 포함(엣지라인의원만 제외) + 거래처 데이터 이관
-- ============================================================================

-- 엣지라인의원(el)만 제외. 나머지 전 브랜드 AI 자동 생성 포함.
-- (엣지라인은 의료광고 사전심의 대상이라 자동 생성 제외를 유지한다.)
update public.brands set ai_enabled = true  where slug <> 'el';
update public.brands set ai_enabled = false where slug = 'el';

-- ── 거래처(vendors) — vendor_master.xlsx 거래처마스터 ────────────────────────
insert into public.vendors
  (code, name, kind, brand_id, brand_name, lead_time_days, moq, contract_status, payment_terms, note)
select 'V-RB-01', '㈜리아이', '제조', b.id, '리앤밤', 21, 500, '협의중', '발주 후 50/50',
       '스피듀얼샷 공급 조건 협의 중. 단가·MOQ 인용 전 최신 합의 확인'
from public.brands b where b.slug = 'rb'
on conflict (code) do update set
  name = excluded.name, kind = excluded.kind, brand_id = excluded.brand_id,
  lead_time_days = excluded.lead_time_days, moq = excluded.moq,
  contract_status = excluded.contract_status, payment_terms = excluded.payment_terms,
  note = excluded.note;

-- ── 발주(purchase_orders) — 발주입고정산 ────────────────────────────────────
insert into public.purchase_orders
  (po_number, po_date, vendor_id, brand_id, item, order_qty, status, note)
select 'PO-RB-260729-01', date '2026-07-29', v.id, b.id, '스피듀얼샷 본체', 500, '발주',
       '단가 확정 전. 최신 합의 확인 후 입력'
from public.vendors v, public.brands b
where v.code = 'V-RB-01' and b.slug = 'rb'
on conflict (po_number) do update set
  po_date = excluded.po_date, item = excluded.item, order_qty = excluded.order_qty,
  status = excluded.status, note = excluded.note;

-- ── 재고(inventory_items) — 재고소진예측 ────────────────────────────────────
insert into public.inventory_items
  (item, brand_id, vendor_id, current_stock, out_30d, safety_days, lead_time_days)
select '스피듀얼샷 본체', b.id, v.id, 320, 210, 7, 21
from public.brands b, public.vendors v
where b.slug = 'rb' and v.code = 'V-RB-01'
  and not exists (
    select 1 from public.inventory_items i where i.item = '스피듀얼샷 본체'
  );
