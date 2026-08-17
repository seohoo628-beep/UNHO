-- ============================================================================
-- 0098 — 채널자산 KPI → 업무투두 담당자별 배정
--   channel_kpis 각 항목을 담당자에게 배정한 todo로 생성한다.
--   재실행 안전: ⟦채널KPI시드⟧ 표식 todo를 지우고 현재 KPI 기준으로 다시 만든다.
--   매핑 기준:
--     채널(입점)                      → 신규 MD
--     화해·글로우픽/입점 심사 관련      → 신규 MD
--     CRM(카카오친구·알림받기)         → 박종혁(경영지원: 단가·마진·계약)
--     콘텐츠(유튜브 PPL·대표 네트워크) → 서현옥(대표)
--     리뷰·SEO·그 외                  → 차민준(마케터)
-- ============================================================================

delete from public.todos where note like '%⟦채널KPI시드⟧%';

with mapping as (
  select k.*,
    case
      when k.category = '콘텐츠' then '서현옥'
      when k.category = '채널' then '신규 MD'
      when k.metric ilike '%화해%' or k.metric ilike '%글로우픽%' or coalesce(k.note,'') ilike '%입점%' then '신규 MD'
      when k.category = 'CRM' then '박종혁'
      else '차민준'
    end as who
  from public.channel_kpis k
)
insert into public.todos (brand_id, title, assignee_user_id, assignee_user_ids, priority, due_date, status, note)
select
  m.brand_id,
  '[채널KPI·' || coalesce(b.name, '공통') || '] ' || m.category || ' — ' || m.metric
    || case when m.target is not null and m.target > 0
            then ' (목표 ' || trim(to_char(m.target, 'FM999,999,999')) || ')' else '' end,
  u.id,
  case when u.id is not null then array[u.id] else '{}'::uuid[] end,
  case when m.category = '채널' then '높음' else '보통' end,
  m.target_date,
  '예정',
  '채널자산 KPI 배정 · 수행주체 ' || coalesce(nullif(m.performer, ''), '-')
    || case when m.note is not null and m.note <> '' then ' · ' || replace(m.note, '⟦보드시드⟧', '') else '' end
    || ' ⟦채널KPI시드⟧'
from mapping m
left join public.brands b on b.id = m.brand_id
left join (
  select distinct on (name) name, id
  from public.users
  order by name, created_at, id
) u on u.name = m.who;
