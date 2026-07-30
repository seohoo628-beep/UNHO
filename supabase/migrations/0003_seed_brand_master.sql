-- ============================================================================
-- 최초 마이그레이션 — data/brand_master.xlsx (법인마스터 / 브랜드마스터 / VI규격)
-- 이관 후에는 이 DB가 원본이다. xlsx 는 archive/ 로 내린다.
-- 브랜드·법인 값은 앱에서 하드코딩하지 않고 전부 이 테이블에서 읽는다.
-- 재실행 가능하도록 upsert 로 작성.
-- ============================================================================

-- ── 법인마스터 ──────────────────────────────────────────────────────────────
insert into public.corporations (name, kind, entity_type, business_no, founded, ceo, address, confirmed, note) values
  ('㈜운호컴퍼니', 'own', 'own', '715-87-03094', '2024.02', '최운호',
   '서울 강남구 신사동 562-17 신영빌딩 301호', '확정',
   '지주 법인. 2019년은 개인사업자 개시 시점으로 법인 설립연월(2024.02)과 구분해 표기한다.'),
  ('뷰티밤㈜', 'own', 'own', '654-81-02686', '2022.02', '최운호',
   '서울 강남구 신사동 562-17 신영빌딩 301호', '확정',
   '㈜운호컴퍼니가 지분 전량 인수 예정. 인수 완료 전까지 별개 당사자로 취급.'),
  ('SBJ컴퍼니', 'partner', 'partner', null, null, '박경배',
   '서울 강남구 청담동', '부분 확정',
   '청담오리골 사업자. 자사 법인 아님. 사업자번호·상세 주소 확인 후 제안서 당사자로 사용.'),
  ('엣지라인의원', 'affiliate', 'partner', null, null, null, null, '미확정',
   '등기부상 최운호 명의 없음. 서면 계약 없이 마케팅 성과 기반 수익 쉐어. 약정서 체결 필요.')
on conflict (name) do update set
  kind = excluded.kind, entity_type = excluded.entity_type, business_no = excluded.business_no,
  founded = excluded.founded, ceo = excluded.ceo, address = excluded.address,
  confirmed = excluded.confirmed, note = excluded.note;

-- ── 브랜드마스터 + VI규격 (소속 법인은 이름으로 조인) ────────────────────────
-- ai_enabled: 엣지라인의원만 false. 의료광고 사전심의 대상이라 자동 생성 제외.
insert into public.brands
  (corporation_id, name, slug, category, flagship, channel, regulation, op_status,
   confirmed, ai_enabled, vi_primary, vi_secondary, vi_accent, vi_bg, tone, vi_confirmed, note)
select c.id, v.name, v.slug, v.category, v.flagship, v.channel, v.regulation, v.op_status,
       v.confirmed, v.ai_enabled, v.vi_primary, v.vi_secondary, v.vi_accent, v.vi_bg,
       v.tone, v.vi_confirmed, v.note
from (values
  ('㈜운호컴퍼니', '신미집', 'sm', 'F&B', '닭발, 연탄불고기, 치킨', null,
   '식품표시광고법 / 원산지표시법', '운영', '확정', true,
   '#B3261E', '#1A1A1A', '#F2C230', '#FFF9F0',
   '연탄불 앞의 열기. 과장 없이 배고프게 만드는 문장. 메뉴와 불 이미지가 주인공.', '제안',
   '마포점. 간판·메뉴판 제목은 Gmarket Sans Bold 병용 가능.'),
  ('㈜운호컴퍼니', '대운목장', 'dw', 'F&B', '정육식당', null,
   '식품표시광고법 / 원산지표시법', '운영', '확정', true,
   '#6B2B23', '#D9C7A7', '#1F1B18', '#FBF7F1',
   '숙성육의 깊이. 목장에서 식탁까지의 거리를 짧게 말한다. 원산지와 등급을 숫자로.', '제안',
   '간판·메뉴판 제목은 Gmarket Sans Bold 병용 가능.'),
  ('SBJ컴퍼니', '청담오리골', 'co', 'F&B', '오리구이', null,
   '식품표시광고법 / 원산지표시법', '계약 전', '부분 확정', false,
   '#2A3B2E', '#C8A96A', '#E8552E', '#F7F4EE',
   '야장의 밤 공기. 24시간 열려 있다는 사실 자체가 메시지. 규모를 과시하지 않고 보여준다.', '제안',
   '청담 오리닭에서 명칭 변경. 건물주 협의 단계. 파트너 법인 SBJ컴퍼니 소속이라 계약·사업자번호 확정 전까지 자동 생성 보류.'),
  ('㈜운호컴퍼니', '주당의비결', 'jd', '건강기능식품·식품', '에너지, 스틱', 'm.jubi.co.kr',
   '건강기능식품법 / 식품표시광고법', '운영', '확정', true,
   '#16202B', '#F0C244', '#3AA76D', '#FFFFFF',
   '술자리 다음 날의 회복. 효능을 단정하지 않고 상황으로 말한다. 건기식 표현 규제 안에서.', '제안',
   '별도 법인이 아니라 ㈜운호컴퍼니 소속 브랜드. 모델 신동희. 배경은 화이트 유지.'),
  ('㈜운호컴퍼니', '슈퍼릴라', 'sr', '건강기능식품', '들깨 오메가3, 들깨오일', null,
   '건강기능식품법 / 식품표시광고법', '운영', '확정', true,
   '#4A6B2A', '#D9C77E', '#E9A319', '#FCFBF6',
   '들깨라는 원료 그 자체. 국산 원물과 추출 방식을 앞세운다. 시니어 가독성 우선.', '제안',
   '본문 최소 16px. 시니어 타깃이므로 저채도 배경 금지.'),
  ('㈜운호컴퍼니', '무당티', 'mdt', '식품', '혈당 스파이크 타겟 필름 (바나바잎추출물, HACCP, 10매)', null,
   '식품표시광고법', '운영', '확정', false,
   '#1C3F94', '#A8CBEF', '#4FD1C5', '#FFFFFF',
   '필름 한 장의 간결함. 성분과 형태를 기술적으로 설명한다. 혈당 표현은 규제 문구 그대로.', '제안',
   '일반식품이므로 기능성 표현 불가. 혈당다운과 색을 의도적으로 분리 — 무당티는 블루.'),
  ('㈜운호컴퍼니', '아이텐션', 'ey', '화장품', '아이백 크림', null,
   '화장품법', '운영', '확정', false,
   '#3E3A5C', '#C9C4DE', '#D8B98C', '#FAF9FC',
   '눈가라는 좁은 면적에 집중. 밤과 회복의 톤. 전후 비교를 과장하지 않는다.', '제안', null),
  ('㈜운호컴퍼니', '파이뷰티', 'pb', '화장품', '마스크, 세럼', null,
   '화장품법', '운영', '확정', false,
   '#2B2B2B', '#EDE7DC', '#C7A24A', '#FFFFFF',
   '미니멀한 데일리 케어. 성분 나열보다 사용 장면. 여백을 크게 쓴다.', '제안',
   '뷰티밤과 색이 겹치지 않도록 차콜 기반으로 분리.'),
  ('뷰티밤㈜', '리앤밤', 'rb', '화장품·기기', '스피듀얼샷, 스피듀얼 앰플', 'reandbomb.com',
   '화장품법 / 의료기기 오인 표현 금지', '운영', '확정', true,
   '#0D0F12', '#B8BDC4', '#C4A265', '#08090B',
   '다크 프리미엄. 기기 기반 홈케어의 기술적 신뢰. 과장 없는 임상적 어조.', '제안',
   '제조사 ㈜리아이. 공급 조건 협의 중. 배경이 어두우므로 본문은 #E8E8EA.'),
  ('뷰티밤㈜', '뷰티밤', 'bb', '화장품', null, 'beautybomb.co.kr',
   '화장품법', '운영', '확정', true,
   '#D9455F', '#F2D7DC', '#1A1A1A', '#FFFBFC',
   '밝고 직진적인 뷰티 톤. 제품컷이 색을 이기게 둔다. 카피는 짧게.', '제안',
   '법인명과 브랜드명 동일. 사용 로고 시안 확정 필요.'),
  ('뷰티밤㈜', '더 토마토', 'tt', '화장품', '듀얼크림, 선크림, 오일미스트', null,
   '화장품법', '운영', '확정', false,
   '#D6402C', '#4E7A3A', '#F2E8DC', '#FFFFFF',
   '원료 이름이 브랜드인 만큼 토마토를 숨기지 않는다. 성분 중심, 장식 최소.', '제안',
   '뷰티밤과 같은 레드 계열이므로 세컨더리 그린으로 구분.'),
  ('뷰티밤㈜', '미스더필플러스', 'mfp', '건강기능식품', null, null,
   '건강기능식품법 / 식품표시광고법', '운영', '확정', false,
   '#3A6EA5', '#CFE0EE', '#F0B429', '#FFFFFF',
   '매일 챙기는 루틴. 기능성은 인정 범위 안에서만 말한다. 신뢰감 있는 블루.', '제안',
   '건강기능식품. 기능성 문구는 인정 표현 그대로 인용.'),
  ('뷰티밤㈜', '혈당다운', 'hd', '건강기능식품', null, null,
   '건강기능식품법 / 식품표시광고법', '운영', '확정', false,
   '#1F6F5C', '#CDE5DD', '#E4572E', '#FFFFFF',
   '숫자로 말하는 브랜드. 혈당 관련 표현은 인정 기능성 문구만. 레드 계열은 쓰지 않는다.', '제안',
   '건강기능식품. 혈액을 연상시키는 레드 주색 금지.'),
  ('엣지라인의원', '엣지라인의원', 'el', '의료', '미용 의료 시술', null,
   '의료법 — 의료광고 사전심의 대상', '제휴', '미확정', false,
   '#17324D', '#CBD5E0', '#A8894F', '#FFFFFF',
   '의료기관 톤. 시술 전후 비교와 효과 단정 표현을 쓰지 않는다. 사전심의 통과 문구만.', '제안',
   '등기부상 명의 없음. 약정서 체결 전까지 이 팔레트로 대외 자료를 만들지 않음. 콘텐츠 자동 생성 제외.')
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

-- ── 사용자 (기준정보 시트: 현재 인원 3명) ──────────────────────────────────
-- auth_id 는 최초 매직링크 로그인 시 이메일 매칭으로 연결한다(서버 콜백).
-- 이메일은 실제 계정으로 교체한다. role: owner=대표, staff=직원, ai=AI 직원.
insert into public.users (email, name, role, job_title) values
  ('choi@unhocompany.com',  '최운호', 'owner', '대표'),
  ('lee@unhocompany.com',   '이아라', 'staff', '경영지원'),
  ('park@unhocompany.com',  '박상민', 'staff', '영업이사'),
  ('ai@unhocompany.com',    'AI 직원', 'ai',   'AI 에이전트')
on conflict (email) do update set
  name = excluded.name, role = excluded.role, job_title = excluded.job_title;
