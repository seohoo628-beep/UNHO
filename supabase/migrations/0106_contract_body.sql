-- 0106 — 계약서 본문(표준 계약서 초안·수정본) 저장. 재실행 안전.
alter table public.contracts add column if not exists body              text;        -- 계약서 본문
alter table public.contracts add column if not exists body_generated_at timestamptz; -- AI 초안 생성 시각
alter table public.contracts add column if not exists draft_inputs      jsonb;       -- 초안 작성에 쓴 조건(목적·대금·납기·특약)
