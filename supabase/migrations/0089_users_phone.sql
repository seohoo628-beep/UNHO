-- 담당자 문자 알림용 휴대폰 번호. 비어 있으면 그 사용자는 문자 알림을 받지 않는다.
-- 입력 예: update public.users set phone = '01012345678' where email = '대상@이메일';
alter table public.users add column if not exists phone text;
