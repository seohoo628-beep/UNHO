-- ============================================================================
-- 0084 — 런칭 업무를 업무투두에도 미러링
-- 런칭준비 폴더(launch_checklist)와 업무투두(todos) 양쪽에서 보이게 한다.
-- todos는 launch_checklist에서 파생 — 담당(실행) 역할을 담당자로 매핑해 배정.
-- 선행: 0082(launch_checklist 시드 + 신규 MD 계정), 0079(구성원 계정).
-- ============================================================================

-- 기존 런칭 시드 투두 제거(재실행 안전).
delete from public.todos where note like '%⟦런칭시드⟧%';

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
