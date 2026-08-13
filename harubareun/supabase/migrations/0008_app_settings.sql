-- ============================================================================
-- 0008 — 앱 설정 저장소 (카카오 알림 연결 등). key/value.
-- 대표만 열람·수정. 서버(cron/callback)는 service_role 로 우회 접근.
-- ============================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists settings_owner on public.app_settings;
create policy settings_owner on public.app_settings
  for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
