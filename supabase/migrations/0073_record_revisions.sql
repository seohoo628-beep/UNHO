-- ============================================================================
-- 0073 — 공용(전 직원) 폴더 버전 기록. owner/staff 접근.
--        entity(테이블명)+record_id 별로 편집 직전 전체 행(jsonb)을 스냅샷.
-- ============================================================================

create table if not exists public.record_revisions (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,          -- 예: meetings
  record_id   uuid not null,
  snapshot    jsonb not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists record_rev_idx on public.record_revisions(entity, record_id, created_at desc);

alter table public.record_revisions enable row level security;
drop policy if exists record_rev_all on public.record_revisions;
create policy record_rev_all on public.record_revisions for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
