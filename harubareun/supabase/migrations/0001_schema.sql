-- ============================================================================
-- 운호컴퍼니 운영 플랫폼 — Phase 1 스키마
-- 대상: corporations, brands, users, tasks, ai_outputs, compliance_checks,
--       approvals
-- 시간대는 애플리케이션에서 Asia/Seoul로 다루고, 저장은 timestamptz(UTC)로 한다.
-- ============================================================================

create extension if not exists "pgcrypto";

-- 역할 3종: 대표(owner) / 직원(staff) / AI 직원(ai)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('owner', 'staff', 'ai');
  end if;
end$$;

-- ── 공용 updated_at 트리거 ──────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

-- ── corporations : 법인·당사자 ──────────────────────────────────────────────
create table if not exists public.corporations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  kind         text not null check (kind in ('own', 'partner', 'affiliate')), -- 자사/파트너/제휴
  entity_type  text not null default 'own' check (entity_type in ('own', 'partner')), -- own/partner 2분류
  business_no  text,
  founded      text,          -- 설립연월 (예: 2024.02). 2019년 개인사업자 개시는 note에.
  ceo          text,
  address      text,
  confirmed    text not null default '확정' check (confirmed in ('확정', '부분 확정', '미확정')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── brands : 브랜드 ─────────────────────────────────────────────────────────
create table if not exists public.brands (
  id              uuid primary key default gen_random_uuid(),
  corporation_id  uuid not null references public.corporations(id) on delete restrict,
  name            text not null unique,
  slug            text not null unique,        -- 약어 (rb, bb, sr ...). 파일명 규칙에 사용.
  category        text,                        -- 화장품 / 건강기능식품 / 식품 / F&B / 의료
  flagship        text,                        -- 대표 제품
  channel         text,                        -- 도메인·채널
  regulation      text,                        -- 표시광고 규제 근거
  op_status       text,                        -- 운영 상태
  confirmed       text not null default '확정',
  note            text,
  -- AI 자동 생성 대상 여부. 엣지라인의원(의료광고 사전심의)은 false.
  ai_enabled      boolean not null default true,
  -- VI 팔레트
  vi_primary      text,
  vi_secondary    text,
  vi_accent       text,
  vi_bg           text,
  font_ko         text not null default 'Pretendard',
  font_en         text not null default 'Pretendard',
  tone            text,                        -- 톤 3줄 정의
  vi_confirmed    text not null default '제안' check (vi_confirmed in ('제안', '확정')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_brands_corp on public.brands(corporation_id);
create index if not exists idx_brands_ai_enabled on public.brands(ai_enabled);

-- ── users : 사용자 ──────────────────────────────────────────────────────────
-- auth_id 는 최초 로그인 시 이메일로 매칭해 서버(서비스 롤)에서 연결한다.
create table if not exists public.users (
  id                 uuid primary key default gen_random_uuid(),
  auth_id            uuid unique references auth.users(id) on delete set null,
  email              text not null unique,
  name               text,
  role               app_role not null,
  job_title          text,                     -- 대표 / 경영지원 / 영업이사
  assigned_brand_ids uuid[] not null default '{}',
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- ── tasks : 업무 ────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid references public.brands(id) on delete set null,
  title             text not null,             -- 업무 내용
  category          text,                      -- 업무 카테고리
  assignee_kind     text not null default 'user' check (assignee_kind in ('user', 'ai')),
  assignee_user_id  uuid references public.users(id) on delete set null,
  ai_agent_type     text,                      -- 'marketer' 등
  status            text not null default '예정'
                    check (status in ('예정', '진행', '완료', '지연', '보류', '취소')),
  due_date          date,                      -- 완료 목표일
  completed_date    date,                      -- 실제 완료일
  wait_reason       text,                      -- 대기 사유
  wait_target       text,                      -- 대기 대상 (대표 등). 지연의 대부분이 회신 대기.
  note              text,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_tasks_brand on public.tasks(brand_id);
create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_tasks_wait_target on public.tasks(wait_target);

-- ── ai_outputs : AI 산출물 ──────────────────────────────────────────────────
create table if not exists public.ai_outputs (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid references public.tasks(id) on delete set null,
  brand_id          uuid not null references public.brands(id) on delete cascade,
  agent_type        text not null,             -- 'marketer'
  title             text,
  input_prompt      text,                      -- 프롬프트 조립 결과 (감사용)
  body              text,                      -- 결과 본문
  attachments       jsonb not null default '[]'::jsonb,
  compliance_status text not null default 'pending'
                    check (compliance_status in ('pending', 'pass', 'fail')),
  approval_status   text not null default 'pending'
                    check (approval_status in ('pending', 'approved', 'rejected', 'revision_requested')),
  revision_note     text,                      -- 수정 요청 내용
  model             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_ai_outputs_brand on public.ai_outputs(brand_id);
create index if not exists idx_ai_outputs_queue
  on public.ai_outputs(compliance_status, approval_status);

-- ── compliance_checks : 규제 검수 결과 ──────────────────────────────────────
create table if not exists public.compliance_checks (
  id            uuid primary key default gen_random_uuid(),
  ai_output_id  uuid not null references public.ai_outputs(id) on delete cascade,
  brand_id      uuid references public.brands(id) on delete set null,
  regulation    text,                          -- 검수 시점 브랜드 규제 근거 스냅샷
  verdict       text not null check (verdict in ('pass', 'fail')),
  findings      jsonb not null default '[]'::jsonb, -- [{phrase, reason, suggestion, rule}]
  checker       text not null default 'rule-based',
  checked_at    timestamptz not null default now()
);
create index if not exists idx_compliance_output on public.compliance_checks(ai_output_id);

-- ── approvals : 승인 이력 ───────────────────────────────────────────────────
create table if not exists public.approvals (
  id                uuid primary key default gen_random_uuid(),
  ai_output_id      uuid not null references public.ai_outputs(id) on delete cascade,
  approver_user_id  uuid references public.users(id) on delete set null,
  decision          text not null check (decision in ('approved', 'rejected', 'revision_requested')),
  reason            text,
  decided_at        timestamptz not null default now()
);
create index if not exists idx_approvals_output on public.approvals(ai_output_id);

-- ── updated_at 트리거 ───────────────────────────────────────────────────────
drop trigger if exists trg_corp_touch on public.corporations;
create trigger trg_corp_touch before update on public.corporations
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_brands_touch on public.brands;
create trigger trg_brands_touch before update on public.brands
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_tasks_touch on public.tasks;
create trigger trg_tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_ai_outputs_touch on public.ai_outputs;
create trigger trg_ai_outputs_touch before update on public.ai_outputs
  for each row execute function public.touch_updated_at();
