-- ============================================================================
-- 0097 — users.job_title 백필
--   staff_directory(직원관리)의 직책을 로그인/담당자 계정 직무로 채운다.
--   이미 직무가 있는 계정은 건드리지 않는다(수기 설정 우선).
--   직무는 홈 '오늘의 체크리스트' 역할 자동필터의 근거가 된다.
-- ============================================================================

update public.users u
set job_title = s.position
from public.staff_directory s
where s.name = u.name
  and s.position is not null and s.position <> ''
  and (u.job_title is null or u.job_title = '')
  and u.role <> 'ai';
