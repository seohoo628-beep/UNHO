-- 0028_payables_recurring.sql — 미지급금 정기 지급(원금·이자·주기·종료일)
alter table public.payables add column if not exists principal bigint not null default 0;      -- 원금
alter table public.payables add column if not exists interest bigint not null default 0;       -- 이자
alter table public.payables add column if not exists component text;                            -- 원금 / 이자 / 원금+이자
alter table public.payables add column if not exists frequency text not null default '없음';    -- 없음 / 매일 / 매주 / 매월
alter table public.payables add column if not exists period_amount bigint not null default 0;   -- 회차(정기) 지급액
alter table public.payables add column if not exists has_end boolean not null default false;    -- 종료일 있음/없음
alter table public.payables add column if not exists end_date date;                             -- 종료일
