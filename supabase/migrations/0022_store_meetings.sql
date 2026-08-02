-- ============================================================================
-- 0022 — F&B/다이닝 플랫폼 미팅·회의 일지(store_meetings).
-- /fnb, /dining 공개 플랫폼 → 서버 액션(service_role)으로만 접근. platform/store로 구분.
-- 첨부파일은 기존 공개 버킷 'generated-media' 재사용(별도 생성 불필요).
-- AI 정리 결과는 ai_summary에 저장.
-- ============================================================================

create table if not exists public.store_meetings (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null,
  store         text not null default 'all',
  title         text not null,
  meeting_type  text not null default '내부',
  meeting_date  date,
  attendees     text,
  location      text,
  body          text,
  ai_summary    text,
  file_path     text,
  file_name     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_store_meetings_pf on public.store_meetings(platform, meeting_date desc);
alter table public.store_meetings enable row level security;
-- 정책 없음 → service_role(서버 액션)만 접근. anon 직접 접근 차단.
