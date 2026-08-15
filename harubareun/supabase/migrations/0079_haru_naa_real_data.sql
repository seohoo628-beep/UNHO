-- ============================================================================
-- 0079 — 하루바른·나아 실데이터 반영 (마케팅보드/조직 자료 기반)
--   · 브랜드 상세 갱신 (카테고리·규제·주력제품·톤)
--   · 제품개발(product_developments)에 실제 제품 6종
--   · 직원(users) 조직 반영
-- 재실행 안전(upsert / not exists).
-- ============================================================================

-- ── 브랜드 상세 ──────────────────────────────────────────────────────────────
update public.brands set
  category   = '일반식품·건강기능식품',
  regulation = '식품표시광고법',
  flagship   = '서리블랙·바비컷·레몽드올리·리셀바인',
  tone       = '건강한 하루 습관. 4종은 일반식품(고형차)이라 기능성·효능 표현 금지. 원료·성분 사실 중심으로 말한다.',
  note       = '2026-09 런칭. 4종 일반식품(고형차) + 건식 예정. 객단가 3만원대. 제조 한솔(턴키).'
where slug = 'hb';

update public.brands set
  category   = '화장품',
  regulation = '화장품법',
  flagship   = '애씨드필·진정광크림',
  tone       = '조금씩 나아지는 피부. 기능성화장품은 인정 범위 내 표현만. 4세대·모낭속 균 등 오인 표현 금지.',
  note       = '2027-03 런칭 예정. 기초·기능성화장품. 객단가 상위. 책임판매관리자 선임이 크리티컬 패스.'
where slug = 'na';

-- ── 제품개발: 실제 제품 6종 ─────────────────────────────────────────────────
insert into public.product_developments (name, brand_id, category, stage, note)
select v.name, b.id, v.category, v.stage, v.note
from (values
  ('서리블랙','hb','일반식품(고형차)','샘플',
   '정제 600mg×60정 · 제조 한솔(턴키) · 주원료 발효서리태분말·검정콩추출분말 · 볶음+발효 이중공정 · 채널 자사몰·스마트스토어 · 타겟 정수리 신경쓰는 30~40대 · 일반식품이라 탈모 등 기능성 표현 금지'),
  ('바비컷','hb','일반식품(고형차)','샘플',
   '정제 600mg×60정 · 안티카브-S(알파사이클로덱스트린 외) · 식전 2정 루틴 · 채널 자사몰·스마트스토어 · 타겟 배달·야식 잦은 20~40대 · 다이어트·흡수저해 표현 금지'),
  ('레몽드올리','hb','일반식품(고형차)','샘플',
   '정제 600mg×60정 · 레몬올리브맥스(레몬과즙분말·올리브잎추출분말 외) · 아침 루틴 · 채널 자사몰·스마트스토어'),
  ('리셀바인','hb','일반식품(고형차)','보류',
   'NMN · 원료 적법성 확인 전 판매 보류(식품공전 등재/한시적 인정 확인 필요) · 세트 부속 SKU'),
  ('애씨드필','na','화장품','기획',
   '필 · AHA·BHA·PHA·LHA · 모공 케어 루틴 · 채널 자사몰·올리브영 · 타겟 모공·각질 고민층 · 4세대·모낭속 균 표현 금지'),
  ('진정광크림','na','화장품','기획',
   '크림 · 애씨드필과 연결 · 채널 자사몰·올리브영')
) as v(name, slug, category, stage, note)
join public.brands b on b.slug = v.slug
where not exists (select 1 from public.product_developments p where p.name = v.name);

-- ── 직원(조직) ──────────────────────────────────────────────────────────────
-- 대표 계정(로그인) 이름을 실제 대표로.
update public.users set name = '서현옥', job_title = '대표' where role = 'owner';

-- 나머지 구성원(이메일은 실제 계정으로 교체). role: staff.
insert into public.users (email, name, role, job_title) values
  ('choi@harubareun.com',   '최운호', 'staff', '고문'),
  ('kim@harubareun.com',    '김려은', 'staff', '총괄 BM'),
  ('cha@harubareun.com',    '차민준', 'staff', '마케터'),
  ('han@harubareun.com',    '한여정', 'staff', '디자인·ABM'),
  ('park@harubareun.com',   '박종혁', 'staff', '경영지원·마케팅'),
  ('parkbh@harubareun.com', '박병헌', 'staff', '영상 PD'),
  ('heo@harubareun.com',    '허승원', 'staff', '영상 PD')
on conflict (email) do update set
  name = excluded.name, role = excluded.role, job_title = excluded.job_title;
