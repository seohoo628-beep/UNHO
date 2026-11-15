-- ============================================================================
-- 0100 — AI 에이전트 정기 업무(루틴).
-- 1) 부서별 AI 에이전트를 users(role='ai')로 등록한다(agent_key로 구분).
-- 2) agent_routines: 에이전트가 매일·매주 맡는 업무 정의(주기·요일·마감 오프셋·참고 데이터·지시문).
-- 3) 크론이 오늘 해당하는 루틴을 todos로 만들고(마감일 포함), 에이전트가 실행해
--    결과를 업무 댓글로 남긴다. (routine_id, routine_period) 유니크라 여러 번 호출해도 안전.
-- 재실행 가능하도록 upsert/if not exists 로 작성.
-- ============================================================================

-- ── 1. 에이전트 사용자 ──────────────────────────────────────────────────────
alter table public.users add column if not exists agent_key text;
create unique index if not exists users_agent_key_uidx on public.users(agent_key) where agent_key is not null;

insert into public.users (email, name, role, job_title, agent_key, active) values
  ('ai-bm@unhocompany.com',         'AI 브랜드매니저', 'ai', 'AI 에이전트 · 브랜드', 'brand-manager',    true),
  ('ai-marketer@unhocompany.com',   'AI 마케터',       'ai', 'AI 에이전트 · 마케팅', 'marketer',         true),
  ('ai-md@unhocompany.com',         'AI MD',           'ai', 'AI 에이전트 · MD',     'merchandiser',     true),
  ('ai-designer@unhocompany.com',   'AI 디자이너',     'ai', 'AI 에이전트 · 디자인', 'designer',         true),
  ('ai-finance@unhocompany.com',    'AI 재무',         'ai', 'AI 에이전트 · 재무',   'finance-manager',  true),
  ('ai-accounting@unhocompany.com', 'AI 경리',         'ai', 'AI 에이전트 · 경리',   'accounting-clerk', true),
  ('ai-hr@unhocompany.com',         'AI 인사',         'ai', 'AI 에이전트 · 인사',   'hr-manager',       true)
on conflict (email) do update set
  name = excluded.name, role = excluded.role, job_title = excluded.job_title,
  agent_key = excluded.agent_key, active = excluded.active;

-- ── 2. 루틴 정의 ────────────────────────────────────────────────────────────
create table if not exists public.agent_routines (
  id               uuid primary key default gen_random_uuid(),
  agent_key        text not null,                     -- users.agent_key
  title            text not null,                     -- 투두에 들어갈 업무명
  cadence          text not null check (cadence in ('daily', 'weekly')),
  weekday          int check (weekday between 1 and 7), -- weekly: 1=월 … 7=일
  weekdays_only    boolean not null default true,     -- daily: 평일만
  due_offset_days  int not null default 0 check (due_offset_days between 0 and 14), -- 생성일 기준 영업일 마감
  priority         text not null default '보통' check (priority in ('높음', '보통', '낮음')),
  brand_id         uuid references public.brands(id) on delete set null,
  context_keys     text[] not null default '{}',      -- 실행 시 읽을 데이터(receivables 등)
  instructions     text not null,                     -- 에이전트 지시문
  auto_run         boolean not null default true,     -- 크론이 자동 실행
  requires_review  boolean not null default true,     -- 실행 후 '진행'(검토 대기)로 둘지, '완료' 처리할지
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (agent_key, title)
);

alter table public.agent_routines enable row level security;
drop policy if exists agent_routines_all on public.agent_routines;
create policy agent_routines_all on public.agent_routines for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

-- ── 3. 투두 연결·실행 상태 ──────────────────────────────────────────────────
alter table public.todos
  add column if not exists routine_id     uuid references public.agent_routines(id) on delete set null,
  add column if not exists routine_period text,          -- 'D:2026-11-16' / 'W:2026-11-16'(그 주 월요일)
  add column if not exists agent_status   text check (agent_status is null or agent_status in ('대기', '실행중', '완료', '실패')),
  add column if not exists agent_run_at   timestamptz,
  add column if not exists agent_error    text;
create unique index if not exists todos_routine_period_uidx
  on public.todos(routine_id, routine_period) where routine_id is not null;

-- ── 4. 기본 루틴 ────────────────────────────────────────────────────────────
-- 지시문 공통 원칙은 코드(src/lib/agents/routine.ts)의 시스템 프롬프트가 붙인다.
insert into public.agent_routines
  (agent_key, title, cadence, weekday, due_offset_days, priority, context_keys, requires_review, instructions) values
  -- 경리
  ('accounting-clerk', '미수금·미지급금 만기 점검', 'daily', null, 0, '높음', '{receivables,payables}', true,
   '오늘 기준 연체 미수금과 7일 안에 입금 예정인 미수금, 7일 안에 지급해야 하는 미지급금을 거래처별로 정리한다. 연체 일수가 긴 순서로 독촉 우선순위를 매기고, 7일 내 지급 예정 합계를 적는다. 독촉 메시지는 초안까지만 쓴다.'),
  ('accounting-clerk', '주간 세금계산서 발행·수취 대조', 'weekly', 1, 2, '높음', '{receivables,payables,purchase_orders}', true,
   '지난주 청구(bill_date)된 미수금 중 매출 세금계산서 발행 대상, 발주·입고는 됐지만 계산서 수취가 안 된 매입 건을 대조표로 만든다. 발급 기한(공급일이 속한 달의 다음 달 10일)이 임박한 건을 맨 위에 둔다. 실제 발급은 사람이 한다.'),
  -- 재무
  ('finance-manager', '일일 손익 지표 점검', 'daily', null, 0, '보통', '{pnl}', false,
   '최근 P&L 스냅샷으로 매출·영업이익·이익률·ROAS·환불률의 전일 대비, 7일 평균 대비 변화를 본다. 평소 범위를 벗어난 지표만 원인 가설과 함께 짚는다. 이상이 없으면 "이상 없음"과 핵심 수치 3개만 쓴다.'),
  ('finance-manager', '주간 자금수지·손익 보고', 'weekly', 1, 1, '높음', '{pnl,receivables,payables}', true,
   '지난주 손익 요약, 이번 주 입금 예정(미수금)과 지급 예정(미지급금), 주말 기준 예상 순현금 흐름을 표로 정리한다. 자금이 부족해지는 날짜가 보이면 첫 줄에 경고한다.'),
  -- MD
  ('merchandiser', '무당티 재고·유통기한·판매처 팔로업 점검', 'daily', null, 0, '보통', '{mdt}', false,
   '무당티 로트별 유통기한 잔여일(90일 이내 임박, 180일 이내 주의)과 판매처별 다음 할 일 날짜가 지났거나 3일 안에 오는 건을 정리한다. 오늘 연락해야 할 판매처와 할 말(요지)을 적는다.'),
  ('merchandiser', '재고 안전재고·발주 필요 품목 점검', 'weekly', 1, 1, '높음', '{inventory,purchase_orders}', true,
   '품목별 현재고와 최근 30일 출고로 재고 일수를 계산하고, 리드타임+안전여유일보다 짧은 품목을 발주 필요로 표시한다. 진행 중 발주(입고 전)를 감안한다. 발주서는 초안 항목(품목·수량 근거)까지만, 단가는 비운다.'),
  ('merchandiser', '공구·입점 파이프라인 주간 정리', 'weekly', 4, 1, '보통', '{mdt,promotions}', true,
   '판매처·공구 후보의 단계별 현황(발굴→제안→샘플→협상→입점→판매중)과 2주 넘게 단계가 멈춘 건을 정리한다. 다음 주 우선 공략 5곳과 각 다음 액션을 제안한다.'),
  -- 마케터
  ('marketer', '주간 프로모션·콘텐츠 캘린더 초안', 'weekly', 1, 1, '보통', '{promotions,brands}', true,
   '이번 주 진행·예정 프로모션과 브랜드별 채널을 기준으로 요일별 콘텐츠 캘린더 초안을 만든다. 각 항목에 브랜드·채널·주제·표시광고 주의점을 붙인다. 숙취해소·혈당·다이어트 등 효능 표현은 쓰지 않는다.'),
  ('marketer', '주간 프로모션 성과 리포트', 'weekly', 5, 0, '보통', '{promotions,pnl}', false,
   '이번 주 종료·진행 프로모션의 결과·성과 입력값과 P&L 추이를 묶어 성과 리포트를 쓴다. 결과 입력이 비어 있는 프로모션은 담당자 입력 필요로 따로 모은다.'),
  -- 브랜드매니저
  ('brand-manager', '브랜드별 주간 KPI·이슈 점검', 'weekly', 2, 1, '보통', '{brands,pnl,promotions}', true,
   '운영 중 브랜드별로 이번 주 프로모션, 매출 지표 흐름, 브랜드 가이드(톤·VI) 이탈 위험을 점검한다. 브랜드마다 한 줄 판단(유지/보완/긴급)과 다음 액션 1개를 쓴다.'),
  ('brand-manager', '신제품 런칭 진행 점검', 'weekly', 3, 0, '높음', '{todos,mdt}', true,
   '진행 중 업무 목록에서 신제품 런칭(주당의비결 × Dr.diet 숙취해소, 무당티 등) 관련 업무를 찾아 마감 지연·임박 건과 막힌 지점(대표 결정 대기 등)을 정리한다. 런칭 일정에 영향을 주는 순서로 쓴다.'),
  -- 디자이너
  ('designer', '디자인 요청·제작 큐 정리', 'weekly', 1, 1, '보통', '{todos}', true,
   '진행 중 업무 중 디자인·상세페이지·배너·카드뉴스·패키지·PPT 관련 업무를 모아 마감순 제작 큐를 만든다. 업무마다 필요한 입력 자료(카피·제품컷·사이즈)와 누락 여부를 표시한다.'),
  -- 인사
  ('hr-manager', '주간 연차·근태 현황 점검', 'weekly', 1, 0, '보통', '{leave}', false,
   '승인 대기 휴가 신청과 향후 14일 안의 휴가 일정을 정리하고, 같은 날 부재가 겹쳐 업무 공백이 생기는 날을 표시한다.')
on conflict (agent_key, title) do nothing;
