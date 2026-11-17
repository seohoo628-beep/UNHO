-- 0108: AI 직원 강화 ① 승인 → 사람 업무 배정, ② 결재 부담 줄이기(실행 빈도 재조정·자동 완료)

-- ① 배정 업무의 출처(AI 결과 업무). 대표 일일 보고가 지연 여부를 추적한다.
alter table public.todos
  add column if not exists source_todo_id uuid references public.todos(id) on delete set null;
create index if not exists todos_source_todo_idx on public.todos(source_todo_id) where source_todo_id is not null;

-- 조치할 것이 없는 결과는 '자동'으로 완료 처리한다.
alter table public.todos drop constraint if exists todos_agent_review_check;
alter table public.todos add constraint todos_agent_review_check
  check (agent_review is null or agent_review in ('승인', '반려', '자동'));

-- 대표 일일 보고가 배정 업무 진행·지연을 읽는다.
update public.agent_routines
   set context_keys = array_append(coalesce(context_keys, '{}'), 'dispatched'), updated_at = now()
 where agent_key = 'management-support' and title = '대표 일일 보고'
   and not ('dispatched' = any(coalesce(context_keys, '{}')));

-- ② 실행 빈도 재조정. 매일 검토: CS·미수금·주당의비결 재고(+검토 없는 대표 보고·손익·무당티·태국).
--    나머지는 주 1회로 요일을 나눠 평일 하루 검토 대상 6건 안팎(조치 없는 결과는 자동 완료되어 실제 결재는 더 적다). 대표가 이미 바꾼 루틴은 건드리지 않도록 현재 값 조건을 건다.
update public.agent_routines as a set cadence = 'weekly', weekday = v.wd, updated_at = now()
  from (values
    ('marketer-judang',   '주당의비결 오늘의 마케팅 액션', 1),
    ('logistics-manager', '입고·출고·재고 이동 점검',      2),
    ('marketer-daeun',    '대운목장 오늘의 마케팅 액션',   2),
    ('marketer-mudangtea','무당티 오늘의 마케팅 액션',     3),
    ('fnb-manager',       'F&B 매장 운영 점검',            3),
    ('sns-manager',       'SNS 오늘의 콘텐츠 기획안',      4),
    ('md-daeun',          '대운목장 식자재·발주 점검',     4),
    ('groupbuy-manager',  '공구 제안·팔로업 점검',         4)
  ) as v(k, t, wd)
 where a.agent_key = v.k and a.title = v.t and a.cadence = 'daily';

update public.agent_routines as a set weekday = v.wd, updated_at = now()
  from (values
    ('community-marketer', '블로그 발행·커뮤니티 동향 (월)', 1, 5),
    ('merchandiser',       '재고 안전재고·발주 필요 품목 점검', 1, 5),
    ('designer',           '디자인 요청·제작 큐 정리',       1, 5)
  ) as v(k, t, old_wd, wd)
 where a.agent_key = v.k and a.title = v.t and a.cadence = 'weekly' and a.weekday = v.old_wd;

-- 겹치는 루틴은 끈다(삭제하지 않음, 관리 화면에서 다시 켤 수 있음).
--   영상 편집 큐 → SNS 기획안, 매장 체크리스트 → F&B 운영 점검, 공구·입점 파이프라인 → 공구 담당, 블로그(목) → 블로그(월)
update public.agent_routines set active = false, updated_at = now()
 where (agent_key, title) in (
   ('video-editor',       '숏폼 편집 큐·촬영 요청 정리'),
   ('fnb-supervisor',     'F&B 매장 체크리스트 점검'),
   ('merchandiser',       '공구·입점 파이프라인 주간 정리'),
   ('community-marketer', '블로그 발행·커뮤니티 동향 (목)')
 );

-- 태국 숏폼 기획은 태국 콘텐츠 화면에서 쓰는 산출물이라 결재함에 올리지 않는다.
update public.agent_routines set requires_review = false, updated_at = now()
 where agent_key = 'thai-content-pd';
