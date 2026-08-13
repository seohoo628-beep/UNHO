-- ============================================================================
-- 0034 — 미지급/미수금 완료 처리. settled_at(완료 시각) 추가.
-- null = 미완료(진행), 값 있음 = 완료(지급완료/수금완료).
-- ============================================================================

alter table public.payables    add column if not exists settled_at timestamptz;
alter table public.receivables add column if not exists settled_at timestamptz;
