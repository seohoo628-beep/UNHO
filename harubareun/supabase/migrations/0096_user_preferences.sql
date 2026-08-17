-- ============================================================================
-- 0096 — 계정별 개인 환경설정
--   본인 계정으로 로그인하면 따라오는 맞춤 설정(기기 무관).
--   { checklistRole, checklistCollapsed, pinnedFolders[], hiddenFolders[] } 등 jsonb.
-- ============================================================================

create table if not exists public.user_preferences (
  user_id     uuid primary key references public.users(id) on delete cascade,
  prefs       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

-- 본인 행만 읽기/쓰기 가능(auth 사용자 ↔ app 사용자 매핑).
drop policy if exists user_preferences_self on public.user_preferences;
create policy user_preferences_self on public.user_preferences for all to authenticated
  using (user_id = (select u.id from public.users u where u.auth_id = auth.uid()))
  with check (user_id = (select u.id from public.users u where u.auth_id = auth.uid()));
