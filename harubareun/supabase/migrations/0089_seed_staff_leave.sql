-- ============================================================================
-- 0089 — 직원관리(staff_directory) + 연차관리(leave_members)에 실제 구성원 입력
-- 입사일(hire_date)·연차 기산일(join_date)은 전부 2026-08-10로 통일.
-- 연봉·연락처 등은 비워 두고 화면에서 수정 가능. 이름 기준 idempotent.
-- ============================================================================

-- 직원관리 -------------------------------------------------------------------
insert into public.staff_directory (name, position, hire_date, salary, phone, note)
select v.name, v.position, date '2026-08-10', 0, null, null
from (values
  ('서현옥', '대표'),
  ('최운호', '고문'),
  ('김려은', '총괄 BM'),
  ('차민준', '마케터'),
  ('한여정', '디자인·ABM'),
  ('박종혁', '경영지원·마케팅'),
  ('박병헌', '영상 PD'),
  ('허승원', '영상 PD')
) as v(name, position)
where not exists (
  select 1 from public.staff_directory s where s.name = v.name
);

-- 연차관리 -------------------------------------------------------------------
insert into public.leave_members (name, join_date, carryover, note, active)
select v.name, date '2026-08-10', 0, null, true
from (values
  ('서현옥'), ('최운호'), ('김려은'), ('차민준'),
  ('한여정'), ('박종혁'), ('박병헌'), ('허승원')
) as v(name)
where not exists (
  select 1 from public.leave_members m where m.name = v.name
);
