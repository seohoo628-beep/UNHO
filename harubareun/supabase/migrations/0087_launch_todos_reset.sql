-- ============================================================================
-- 0087 — 업무투두 런칭 업무 확정 리셋 (최종본)
-- 0080/0084/0086 등 여러 시드가 섞여 제목이 서로 달라 중복이 남는 문제를
-- 한 번에 정리한다. "[카테고리] 항목" 형식의 런칭성 업무를 전부 지우고,
-- launch_checklist(단일 원본, 중복 제거 후)에서 정확히 1건씩 재삽입한다.
-- 실행 후 런칭 업무는 정확히 launch_checklist 건수(현재 122건)로 고정된다.
-- 선행: 0082(launch_checklist + 신규 MD), 0079(구성원 계정). 재실행 안전.
-- 주의: 제목이 "[...] ..." 형식인 업무는 런칭 업무로 간주해 삭제 대상이 된다.
-- ============================================================================

-- 0) launch_checklist 자체 중복 제거((scope, seq) 기준 1건만 유지)
delete from public.launch_checklist a
using public.launch_checklist b
where a.ctid > b.ctid
  and a.scope = b.scope
  and a.seq   = b.seq;

-- 1) 모든 런칭성 todos 삭제: ⟦런칭시드⟧ 태그 또는 "[카테고리] " 형식 제목
delete from public.todos
where note like '%⟦런칭시드⟧%'
   or title like '[%] %';

-- 2) launch_checklist에서 정확히 1건씩 재삽입(담당자 매핑)
insert into public.todos
  (title, brand_id, assignee_user_id, assignee_user_ids, priority, status, due_date, note)
select
  '[' || c.category || '] ' || c.item,
  c.brand_id,
  u.id,
  case when u.id is not null then array[u.id] else '{}'::uuid[] end,
  case c.priority when '최우선' then '높음' when '높음' then '높음' else '보통' end,
  '예정',
  c.due_date,
  '담당 ' || coalesce(nullif(c.owner_role, ''), '-')
    || case when coalesce(c.collab, '')   <> '' then ' · 협업 ' || c.collab   else '' end
    || case when coalesce(c.reviewer, '') <> '' then ' · 검수 ' || c.reviewer else '' end
    || ' ⟦런칭시드⟧'
from public.launch_checklist c
left join (values
  ('경영지원', '박종혁'),
  ('BM',      '김려은'),
  ('마케터',   '차민준'),
  ('디자이너', '한여정'),
  ('고문',     '최운호'),
  ('대표이사', '서현옥'),
  ('MD',      '신규 MD')
) as m(role, person) on m.role = c.owner_role
left join public.users u on u.name = m.person
where c.seed_tag = '⟦런칭체크시드⟧';

-- 3) 확인용(선택): 실행 후 아래 두 값이 같아야 한다.
--   select count(*) from public.launch_checklist where seed_tag = '⟦런칭체크시드⟧';
--   select count(*) from public.todos where note like '%⟦런칭시드⟧%';
