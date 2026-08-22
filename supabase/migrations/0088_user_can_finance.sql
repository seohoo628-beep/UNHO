-- 재무(미수금·미지급) 열람 권한을 이메일 하드코딩 대신 users 컬럼으로 관리.
-- 부여: update public.users set can_finance = true where email = '대상@이메일';
alter table public.users add column if not exists can_finance boolean not null default false;

-- 기존 하드코딩돼 있던 박상민 계정을 이관.
update public.users set can_finance = true
 where lower(coalesce(email, '')) in ('psm@unocompany.net', 'psm@unhocompany.com');
