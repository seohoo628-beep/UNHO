-- ============================================================================
-- 0035 — CEO 투두 DB화(기기 간 동기화). 기존 localStorage → 서버 공유.
-- 대표(owner) 개인 보드이므로 owner만 접근.
-- ============================================================================

create table if not exists public.ceo_todos (
  id         text primary key,                     -- 클라이언트 생성 id 유지
  no         int,
  cat        text,
  text       text not null,
  pri        text not null default '최우선',
  done       boolean not null default false,
  link       text,
  files      jsonb not null default '[]'::jsonb,
  src        text,                                 -- 전직원 투두 이관 원본 id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ceo_todos enable row level security;
drop policy if exists ceo_todos_owner on public.ceo_todos;
create policy ceo_todos_owner on public.ceo_todos
  for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
