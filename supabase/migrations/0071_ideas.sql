-- ============================================================================
-- 0071 — 아이디어 관리(대표 개인). CEO 전용. AI·음성 입력 + 버전 기록(복원).
-- ============================================================================

create or replace function public.current_user_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ceo from public.users where auth_id = auth.uid() and active = true limit 1), false);
$$;

create table if not exists public.ideas (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  body        text,
  tags        text,
  status      text not null default '수집',   -- 수집/발전중/보류/실행
  pinned      boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.ideas enable row level security;
drop policy if exists ideas_ceo on public.ideas;
create policy ideas_ceo on public.ideas for all to authenticated
  using (public.current_user_is_ceo()) with check (public.current_user_is_ceo());

-- 버전 기록(노션식 복원). 저장/복원 시 직전 상태를 스냅샷.
create table if not exists public.idea_revisions (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references public.ideas(id) on delete cascade,
  title       text,
  body        text,
  tags        text,
  status      text,
  note        text,                            -- '저장 전'/'복원 전' 등 라벨
  created_at  timestamptz not null default now()
);
create index if not exists idea_revisions_idea_idx on public.idea_revisions(idea_id, created_at desc);
alter table public.idea_revisions enable row level security;
drop policy if exists idea_revisions_ceo on public.idea_revisions;
create policy idea_revisions_ceo on public.idea_revisions for all to authenticated
  using (public.current_user_is_ceo()) with check (public.current_user_is_ceo());
