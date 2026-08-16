-- ============================================================================
-- 0094 — 플랫폼 전체 백업/되돌리기
-- 주요 운영 테이블 전체를 스냅샷(jsonb)으로 저장. 최대 1년 보관.
-- '전체 되돌리기' 시 저장된 시점으로 복원(upsert + 이후 생성분 삭제).
-- ============================================================================

create table if not exists public.platform_backups (
  id          uuid primary key default gen_random_uuid(),
  label       text,
  kind        text not null default 'manual',       -- manual / auto / pre-restore
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  summary     jsonb not null default '{}'::jsonb,    -- { 테이블: 행수 }
  data        jsonb not null default '{}'::jsonb      -- { 테이블: [행...] }
);
create index if not exists platform_backups_created_idx on public.platform_backups(created_at desc);

alter table public.platform_backups enable row level security;
drop policy if exists platform_backups_owner on public.platform_backups;
create policy platform_backups_owner on public.platform_backups for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
