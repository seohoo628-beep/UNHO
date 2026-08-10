-- ============================================================================
-- 0063 — CEO 아침 브리핑 보관. 매일 생성된 브리핑(HTML)을 날짜별로 저장.
--   CEO 본인만 열람(0054의 current_user_is_ceo 재사용).
-- ============================================================================

create or replace function public.current_user_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ceo from public.users where auth_id = auth.uid() and active = true limit 1), false);
$$;

create table if not exists public.morning_briefs (
  id          uuid primary key default gen_random_uuid(),
  brief_date  date not null unique,
  html        text not null,
  summary     text,
  created_at  timestamptz not null default now()
);
create index if not exists morning_briefs_date_idx on public.morning_briefs(brief_date desc);

alter table public.morning_briefs enable row level security;
drop policy if exists morning_briefs_ceo on public.morning_briefs;
create policy morning_briefs_ceo on public.morning_briefs
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());
