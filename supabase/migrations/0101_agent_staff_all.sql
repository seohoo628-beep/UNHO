-- ============================================================================
-- 0101 — AI 에이전트 전원(22명)을 직원으로 등록하고 정기업무를 붙인다.
-- 0100(7명·루틴 13건) 위에 15명을 더하고, 경영지원이 매일 전 부서 결과를 모아
-- 대표에게 보고(알림)하도록 한다. 재실행 안전(upsert / if not exists).
-- ============================================================================

-- ── 1. 루틴 실행 순서·보고 옵션 ─────────────────────────────────────────────
alter table public.agent_routines
  add column if not exists run_last   boolean not null default false, -- 같은 날 다른 루틴이 끝난 뒤 실행(일일 보고용)
  add column if not exists notify_ceo boolean not null default false; -- 실행 후 대표에게 알림

-- ── 2. 에이전트 사용자(신규 15명 + 기존 3명 역할명 정리) ──────────────────────
insert into public.users (email, name, role, job_title, agent_key, active) values
  ('ai-cs@unhocompany.com',              'AI CS',              'ai', 'AI 에이전트 · CS',            'cs-manager',          true),
  ('ai-logistics@unhocompany.com',       'AI 물류',            'ai', 'AI 에이전트 · 물류',          'logistics-manager',   true),
  ('ai-marketer-judang@unhocompany.com', 'AI 마케터 주당의비결', 'ai', 'AI 에이전트 · 마케팅',        'marketer-judang',     true),
  ('ai-marketer-daeun@unhocompany.com',  'AI 마케터 대운목장',   'ai', 'AI 에이전트 · 마케팅',        'marketer-daeun',      true),
  ('ai-marketer-mdt@unhocompany.com',    'AI 마케터 무당티',     'ai', 'AI 에이전트 · 마케팅',        'marketer-mudangtea',  true),
  ('ai-support@unhocompany.com',         'AI 경영지원',        'ai', 'AI 에이전트 · 경영지원',      'management-support',  true),
  ('ai-video@unhocompany.com',           'AI 영상PD',          'ai', 'AI 에이전트 · 영상',          'video-editor',        true),
  ('ai-groupbuy@unhocompany.com',        'AI 공구',            'ai', 'AI 에이전트 · 공동구매',      'groupbuy-manager',    true),
  ('ai-sns@unhocompany.com',             'AI SNS',             'ai', 'AI 에이전트 · SNS',           'sns-manager',         true),
  ('ai-md-judang@unhocompany.com',       'AI MD 주당의비결',    'ai', 'AI 에이전트 · MD',            'md-judang',           true),
  ('ai-md-daeun@unhocompany.com',        'AI MD 대운목장',      'ai', 'AI 에이전트 · MD',            'md-daeun',            true),
  ('ai-md-mdt@unhocompany.com',          'AI MD 무당티',        'ai', 'AI 에이전트 · MD',            'md-mudangtea',        true),
  ('ai-community@unhocompany.com',       'AI 블로그·커뮤니티',  'ai', 'AI 에이전트 · 콘텐츠',        'community-marketer',  true),
  ('ai-fnb-manager@unhocompany.com',     'AI F&B 관리자',       'ai', 'AI 에이전트 · F&B',           'fnb-manager',         true),
  ('ai-fnb-sv@unhocompany.com',          'AI F&B 슈퍼바이저',   'ai', 'AI 에이전트 · F&B',           'fnb-supervisor',      true)
on conflict (email) do update set
  name = excluded.name, role = excluded.role, job_title = excluded.job_title,
  agent_key = excluded.agent_key, active = excluded.active;

update public.users set name = 'AI 재무팀장', job_title = 'AI 에이전트 · 재무'        where agent_key = 'finance-manager';
update public.users set name = 'AI 마케터 규제검수', job_title = 'AI 에이전트 · 마케팅' where agent_key = 'marketer';
update public.users set name = 'AI MD 공통', job_title = 'AI 에이전트 · MD'            where agent_key = 'merchandiser';

-- 무당티 일일 점검은 무당티 전담 MD가 맡는다. 이미 생성된 투두의 담당자도 옮긴다.
update public.agent_routines set agent_key = 'md-mudangtea'
 where agent_key = 'merchandiser' and title = '무당티 재고·유통기한·판매처 팔로업 점검'
   and not exists (select 1 from public.agent_routines x where x.agent_key = 'md-mudangtea' and x.title = '무당티 재고·유통기한·판매처 팔로업 점검');
-- 0100을 다시 실행해 공통 MD 쪽에 같은 루틴이 되살아난 경우 중복 실행을 막는다.
update public.agent_routines set active = false
 where agent_key = 'merchandiser' and title = '무당티 재고·유통기한·판매처 팔로업 점검'
   and exists (select 1 from public.agent_routines x where x.agent_key = 'md-mudangtea' and x.title = '무당티 재고·유통기한·판매처 팔로업 점검');
update public.todos t set assignee_user_id = u.id, assignee_user_ids = array[u.id]
  from public.agent_routines r, public.users u
 where t.routine_id = r.id and r.agent_key = 'md-mudangtea' and u.agent_key = 'md-mudangtea'
   and t.status in ('예정', '진행');

-- ── 3. 신규 정기업무 ────────────────────────────────────────────────────────
-- 공통 원칙(금액 생성 금지·발송 금지·데이터 밖 사실 금지)은 코드의 시스템 프롬프트가 붙인다.
insert into public.agent_routines
  (agent_key, title, cadence, weekday, due_offset_days, priority, context_keys, requires_review, instructions) values
  -- CS
  ('cs-manager', 'CS 문의·리뷰 동향 점검', 'daily', null, 0, '보통', '{reviews,todos}', true,
   '리뷰 수 변화(리뷰 스냅샷)와 진행 중 업무 중 CS·클레임·교환·환불 관련 건을 정리한다. 처리 기한이 지났거나 오늘 마감인 건을 맨 위에 둔다. 문의함이 연결돼 있지 않으면 그 사실과 대표가 넣어 줄 자료(스마트스토어·카카오채널 문의 내보내기)를 적는다. 답변은 초안까지만 쓴다.'),
  -- 물류
  ('logistics-manager', '입고·출고·재고 이동 점검', 'daily', null, 0, '보통', '{purchase_orders,inventory}', true,
   '입고 예정일이 지났거나 3일 안에 오는 발주, 입고 수량이 발주 수량과 다른 건, 재고 일수가 리드타임보다 짧은 품목을 정리한다. 택배·3PL 출고 데이터가 연결돼 있지 않으면 그 사실을 첫 줄에 쓴다.'),
  -- 브랜드 마케터 3명
  ('marketer-judang', '주당의비결 오늘의 마케팅 액션', 'daily', null, 0, '보통', '{promotions,brands,todos}', true,
   '주당의비결의 진행·예정 프로모션과 관련 업무를 보고 오늘 할 마케팅 액션 3개(채널·주제·목적)를 제안한다. 숙취해소 기능성 표현은 자율심의 승인 전 쓰지 않는다. 품절·재입고 일정이 있으면 구매 유도 문구를 쓰지 않는다.'),
  ('marketer-daeun', '대운목장 오늘의 마케팅 액션', 'daily', null, 0, '보통', '{promotions,brands,store_meetings}', true,
   '대운목장(F&B)의 진행 프로모션, 최근 매장 회의 내용을 보고 오늘 할 매장·SNS·예약 채널 액션 3개를 제안한다. 매장 운영 이슈가 보이면 F&B 관리자에게 넘길 항목으로 따로 적는다.'),
  ('marketer-mudangtea', '무당티 오늘의 마케팅 액션', 'daily', null, 0, '보통', '{promotions,mdt,brands}', true,
   '무당티 판매처 단계와 프로모션을 보고 오늘 할 마케팅 액션 3개를 제안한다. "혈당 스파이크 타겟"은 허가 문구 그대로만 쓰고, 혈당 조절·감소 등 허가 범위를 넘는 효과 단정은 쓰지 않는다.'),
  -- SNS·영상·커뮤니티
  ('sns-manager', 'SNS 오늘의 콘텐츠 기획안', 'daily', null, 0, '보통', '{promotions,brands}', true,
   '브랜드 순환(주당의비결·무당티·대운목장 등)으로 오늘 올릴 카드뉴스 1건, 릴스·숏츠 1건, 스레드 1건의 주제·후크·본문 초안·해시태그를 만든다. 공개는 대표 승인 후에만 하며, 승인 대기 목록으로 정리한다.'),
  ('video-editor', '숏폼 편집 큐·촬영 요청 정리', 'daily', null, 0, '낮음', '{todos,promotions}', true,
   '진행 중 업무와 프로모션에서 영상이 필요한 건을 찾아 편집 큐(마감순)와 촬영 요청 목록을 만든다. 건마다 길이·비율·필요한 원본·음원 저작권 확인 여부를 표시한다.'),
  ('community-marketer', '블로그 발행·커뮤니티 동향 (월)', 'weekly', 1, 1, '보통', '{brands,promotions}', true,
   '이번 주 공식 블로그 발행 주제 3개(검색 키워드·제목·핵심 내용)와 체험단·공식 계정 카페 이벤트 제안을 만든다. 체험단 글에는 광고·협찬 표시를 전제로 쓴다. 소비자를 가장한 후기·댓글은 만들지 않는다.'),
  ('community-marketer', '블로그 발행·커뮤니티 동향 (목)', 'weekly', 4, 1, '낮음', '{brands,promotions}', true,
   '월요일 계획 대비 블로그 발행 현황을 점검하고 주말용 주제 2개를 제안한다. 커뮤니티에서 확인이 필요한 브랜드 언급이 있다면 대표가 확인할 링크 목록 형식으로 적는다(데이터가 없으면 없음).'),
  -- 공구
  ('groupbuy-manager', '공구 제안·팔로업 점검', 'daily', null, 0, '높음', '{crm_leads,promotions}', true,
   '공구 셀러·바이어 리드 중 팔로업 예정일이 지났거나 오늘인 건, 회신 후 2주 넘게 멈춘 건을 정리한다. 오늘 연락할 곳 5곳과 각 제안 요지를 적는다. 제안 메일·DM은 초안까지만 쓰고 단가는 비운다.'),
  -- 브랜드 MD
  ('md-judang', '주당의비결 재고·입점 점검', 'daily', null, 0, '높음', '{inventory,purchase_orders,product_dev}', true,
   '주당의비결 품목의 재고 일수, 진행 중 발주·입고 일정, 신제품(Dr.diet 콜라보 등) 개발 단계를 점검한다. 품절이거나 재고 일수가 리드타임보다 짧은 품목과 재입고 예정일을 맨 위에 둔다.'),
  ('md-daeun', '대운목장 식자재·발주 점검', 'daily', null, 0, '보통', '{purchase_orders,store_meetings}', true,
   '대운목장 관련 진행 발주와 최근 매장 회의에서 나온 식자재·발주·원가 이슈를 정리한다. 오늘 확인할 거래처와 품목을 적는다.'),
  -- F&B
  ('fnb-manager', 'F&B 매장 운영 점검', 'daily', null, 0, '보통', '{store_meetings,todos}', true,
   '최근 매장 회의록과 진행 업무에서 매장 운영 이슈(인력·위생·설비·매출)를 정리하고 오늘 조치할 3가지를 적는다. 매장별로 구분한다.'),
  ('fnb-supervisor', 'F&B 매장 체크리스트 점검', 'daily', null, 0, '보통', '{store_meetings,todos}', true,
   '매장별 오픈·마감 점검, 위생, 재고 확인 항목 중 최근 회의·업무에서 미결로 남은 것을 체크리스트로 만든다. 지난번 지적 사항이 반복되면 표시한다.'),
  -- 경영지원: 전 부서 결과를 모아 대표 보고 (다른 루틴이 끝난 뒤 실행, 대표 알림)
  ('management-support', '대표 일일 보고', 'daily', null, 0, '높음', '{agent_reports,todos}', false,
   '오늘 AI 에이전트들이 올린 정기업무 결과를 모아 대표 보고서를 쓴다. 1) 오늘 3줄 요약 2) 대표 결정·확인 필요 목록(부서·건·기한) 3) 승인 대기 콘텐츠·초안 목록 4) 부서별 한 줄 현황 5) 실패하거나 데이터가 없는 부서. 각 부서 결과에 없는 내용은 쓰지 않는다.')
on conflict (agent_key, title) do nothing;

update public.agent_routines set run_last = true, notify_ceo = true
 where agent_key = 'management-support' and title = '대표 일일 보고';
