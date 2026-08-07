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
