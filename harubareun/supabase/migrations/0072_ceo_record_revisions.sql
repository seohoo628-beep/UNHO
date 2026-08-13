-- ============================================================================
-- 0072 — 대표 전용 폴더 공용 버전 기록(노션식 복원). CEO 전용.
--        entity(테이블명)+record_id 별로 편집 직전 전체 행(jsonb)을 스냅샷.
-- ============================================================================

create or replace function public.current_user_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ceo from public.users where auth_id = auth.uid() and active = true limit 1), false);
$$;

create table if not exists public.ceo_record_revisions (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,          -- 예: ceo_todos, contacts, reminders, ideas
  record_id   text not null,          -- 대상 행 id(테이블마다 uuid/텍스트 혼용이라 text)
  snapshot    jsonb not null,         -- 편집/복원 직전의 전체 행
  note        text,                   -- '저장 전'/'복원 전' 등
  created_at  timestamptz not null default now()
);
-- 이전 버전(uuid)로 만들었으면 text로 변경.
alter table public.ceo_record_revisions alter column record_id type text using record_id::text;
create index if not exists ceo_rev_idx on public.ceo_record_revisions(entity, record_id, created_at desc);

alter table public.ceo_record_revisions enable row level security;
drop policy if exists ceo_rev_ceo on public.ceo_record_revisions;
create policy ceo_rev_ceo on public.ceo_record_revisions for all to authenticated
  using (public.current_user_is_ceo()) with check (public.current_user_is_ceo());
