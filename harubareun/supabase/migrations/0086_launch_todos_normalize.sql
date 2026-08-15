-- ============================================================================
-- 0086 — 업무투두 런칭 업무 정규화(중복 확정 제거)
-- 0085의 태그 기반 삭제로 안 잡히는 중복까지 제거하기 위해, 런칭 업무를
-- '제목이 launch_checklist 항목과 일치'하는 기준으로 전량 삭제 후 1건씩 재삽입.
-- 결과적으로 런칭 업무는 정확히 launch_checklist 건수(현재 122건)로 고정된다.
-- 선행: 0082(launch_checklist + 신규 MD), 0079(구성원 계정). 재실행 안전.
-- ============================================================================

-- 1) 런칭 업무 전량 삭제 — 제목 일치 또는 ⟦런칭시드⟧ 태그(태그 없는 과거 시드까지 포함)
delete from public.todos t
where t.note like '%⟦런칭시드⟧%'
   or exists (
        select 1 from public.launch_checklist c
        where t.title = '[' || c.category || '] ' || c.item
      );

-- 2) launch_checklist에서 정확히 1건씩 재삽입
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

-- 3) 그 외 완전중복(제목·브랜드·마감·담당자·상태 동일)도 1건만 남기고 삭제
delete from public.todos t
using public.todos k
where t.ctid > k.ctid
  and t.title = k.title
  and coalesce(t.brand_id::text, '∅')         = coalesce(k.brand_id::text, '∅')
  and coalesce(t.due_date::text, '∅')         = coalesce(k.due_date::text, '∅')
  and coalesce(t.assignee_user_id::text, '∅') = coalesce(k.assignee_user_id::text, '∅')
  and coalesce(t.status, '∅')                 = coalesce(k.status, '∅');
