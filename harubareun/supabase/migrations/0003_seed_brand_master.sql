-- ============================================================================
-- 브랜드/법인 기초 시드 — 하루바른 · 나아 통합 플랫폼
-- 이관 후에는 이 DB가 원본이다. 브랜드·법인 값은 앱에서 하드코딩하지 않고
-- 전부 이 테이블에서 읽는다. 재실행 가능하도록 upsert 로 작성.
--
-- ⚠️ 카테고리·규제 근거·주력제품·VI 팔레트·톤은 임시 기본값이다.
--    실제 브랜드 정보 확정 후 /brands 화면 또는 이 시드에서 교체한다.
-- ============================================================================

-- ── 법인마스터 ──────────────────────────────────────────────────────────────
insert into public.corporations (name, kind, entity_type, business_no, founded, ceo, address, confirmed, note) values
  ('하루바른㈜', 'own', 'own', null, null, null, null, '미확정',
   '하루바른·나아 두 브랜드를 운영하는 자사 법인. 사업자번호·설립연월·대표·주소 확정 필요.')
on conflict (name) do update set
  kind = excluded.kind, entity_type = excluded.entity_type, business_no = excluded.business_no,
  founded = excluded.founded, ceo = excluded.ceo, address = excluded.address,
  confirmed = excluded.confirmed, note = excluded.note;

-- ── 브랜드마스터 + VI규격 (소속 법인은 이름으로 조인) ────────────────────────
insert into public.brands
  (corporation_id, name, slug, category, flagship, channel, regulation, op_status,
   confirmed, ai_enabled, vi_primary, vi_secondary, vi_accent, vi_bg, tone, vi_confirmed, note)
select c.id, v.name, v.slug, v.category, v.flagship, v.channel, v.regulation, v.op_status,
       v.confirmed, v.ai_enabled, v.vi_primary, v.vi_secondary, v.vi_accent, v.vi_bg,
       v.tone, v.vi_confirmed, v.note
from (values
  ('하루바른㈜', '하루바른', 'hb', '건강기능식품·식품', null, null,
   '건강기능식품법 / 식품표시광고법', '운영', '미확정', true,
   '#3F7D4E', '#DCE8D5', '#E8A33D', '#F7FAF4',
   '매일 바르게 챙기는 하루. 효능을 단정하지 않고 습관·루틴으로 말한다. 자연·정직한 톤.', '제안',
   '임시 기본값. 카테고리·규제 근거·주력제품·VI 확정 후 교체.'),
  ('하루바른㈜', '나아', 'na', '건강기능식품·식품', null, null,
   '식품표시광고법', '운영', '미확정', true,
   '#2C6E7F', '#CFE3E6', '#E0846B', '#F6FAFB',
   '조금씩 나아지는 감각. 과장 없이 변화의 과정을 보여준다. 부드럽고 신뢰감 있는 톤.', '제안',
   '임시 기본값. 카테고리·규제 근거·주력제품·VI 확정 후 교체.')
) as v(corp, name, slug, category, flagship, channel, regulation, op_status, confirmed,
       ai_enabled, vi_primary, vi_secondary, vi_accent, vi_bg, tone, vi_confirmed, note)
join public.corporations c on c.name = v.corp
on conflict (slug) do update set
  corporation_id = excluded.corporation_id, name = excluded.name, category = excluded.category,
  flagship = excluded.flagship, channel = excluded.channel, regulation = excluded.regulation,
  op_status = excluded.op_status, confirmed = excluded.confirmed, ai_enabled = excluded.ai_enabled,
  vi_primary = excluded.vi_primary, vi_secondary = excluded.vi_secondary,
  vi_accent = excluded.vi_accent, vi_bg = excluded.vi_bg, tone = excluded.tone,
  vi_confirmed = excluded.vi_confirmed, note = excluded.note;

-- ── 사용자 ──────────────────────────────────────────────────────────────────
-- auth_id 는 최초 매직링크 로그인 시 이메일 매칭으로 연결한다(서버 콜백).
-- 이메일은 실제 계정으로 교체한다. role: owner=대표, staff=직원, ai=AI 직원.
insert into public.users (email, name, role, job_title) values
  ('seohoo628@gmail.com',   '대표',    'owner', '대표'),
  ('staff@harubareun.com',  '직원',    'staff', '경영지원'),
  ('ai@harubareun.com',     'AI 직원', 'ai',    'AI 에이전트')
on conflict (email) do update set
  name = excluded.name, role = excluded.role, job_title = excluded.job_title;
