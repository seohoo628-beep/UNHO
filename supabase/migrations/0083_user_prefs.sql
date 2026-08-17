-- 개인별 맞춤 설정(계정 단위). 일일 체크리스트 숨김 항목, 폴더 즐겨찾기/숨김 등.
create table if not exists public.user_prefs (
  user_id uuid primary key references public.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

-- 본인 것만 읽고 쓸 수 있음.
drop policy if exists user_prefs_self on public.user_prefs;
create policy user_prefs_self on public.user_prefs for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());
