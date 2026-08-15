-- ============================================================================
-- 0088 — 업무투두 런칭 업무 중복의 실제 원인 수정: users 이름 중복
-- 원인: 재삽입 조인 `u.name = person` 이 같은 이름(김려은·박종혁 등) 여러 행과
--       매칭되어 해당 담당자의 업무가 배로 생성됨(브랜드별 업무는 ×2 = 4건).
-- 해결: (a) users 이름 중복을 정리(가장 오래된 1행만 남김, 참조는 유지쪽으로 이관),
--       (b) 런칭 todos 전량 삭제 후 이름당 1명만 매칭해 재삽입.
-- 선행: 0082(launch_checklist + 신규 MD), 0079(구성원 계정). 재실행 안전.
-- ============================================================================

-- (a) users 이름 중복 정리 — 유지 대상(가장 오래된 행)으로 참조 이관 후 중복 삭제
with ranked as (
  select id, name,
         row_number() over (partition by name order by created_at, id) as rn,
         first_value(id) over (partition by name order by created_at, id) as keep_id
  from public.users
), dups as (
  select id, keep_id from ranked where rn > 1
)
-- 참조 이관: todos 단일 담당자
update public.todos t set assignee_user_id = d.keep_id
  from dups d where t.assignee_user_id = d.id;
update public.todos t set created_by = d.keep_id
  from dups d where t.created_by = d.id;
-- 중복 user 삭제
delete from public.users u using (
  select id from public.users x
  where exists (
    select 1 from public.users y
    where y.name = x.name and (y.created_at, y.id) < (x.created_at, x.id)
  )
) dd where u.id = dd.id;

-- (b) 런칭 todos 재정규화(이름당 1명만 매칭 → 정확히 launch_checklist 건수)
delete from public.launch_checklist a using public.launch_checklist b
  where a.ctid > b.ctid and coalesce(a.scope,'')=coalesce(b.scope,'')
    and a.category=b.category and a.item=b.item;

delete from public.todos where note like '%⟦런칭시드⟧%' or title like '[%] %';

insert into public.todos
  (title, brand_id, assignee_user_id, assignee_user_ids, priority, status, due_date, note)
select
  '[' || c.category || '] ' || c.item, c.brand_id, u.id,
  case when u.id is not null then array[u.id] else '{}'::uuid[] end,
  case c.priority when '최우선' then '높음' when '높음' then '높음' else '보통' end,
  '예정', c.due_date,
  '담당 ' || coalesce(nullif(c.owner_role,''),'-')
    || case when coalesce(c.collab,'')<>'' then ' · 협업 '||c.collab else '' end
    || case when coalesce(c.reviewer,'')<>'' then ' · 검수 '||c.reviewer else '' end
    || ' ⟦런칭시드⟧'
from public.launch_checklist c
left join (values
  ('경영지원','박종혁'),('BM','김려은'),('마케터','차민준'),
  ('디자이너','한여정'),('고문','최운호'),('대표이사','서현옥'),('MD','신규 MD')
) as m(role, person) on m.role = c.owner_role
left join (select distinct on (name) name, id from public.users order by name, created_at, id) u
  on u.name = m.person;
