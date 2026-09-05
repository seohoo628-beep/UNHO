-- 0095 가계부 영수증 사진 첨부
alter table public.ledger_entries add column if not exists photos jsonb not null default '[]'::jsonb;
