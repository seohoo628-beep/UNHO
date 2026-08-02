-- ============================================================================
-- 0022 — UNO 자기 관리 플랫폼 상태 저장.
-- /uno 는 공개(비로그인) 개인 도구라, 서버 액션(service_role)으로만 읽고 쓴다.
-- 상태 전체를 단일 행(jsonb)으로 저장 → 모든 기기가 같은 데이터를 공유(자동 동기화).
-- RLS 활성 + 정책 없음 → anon/authenticated 직접 접근 차단, service_role만 우회 접근.
-- ============================================================================

create table if not exists public.uno_state (
  id          text primary key default 'default',
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.uno_state enable row level security;
