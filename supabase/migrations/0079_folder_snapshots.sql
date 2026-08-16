-- ============================================================================
-- 0079 — 폴더 단위 "시간대별 전체 데이터" 스냅샷(노션식 전체 복원).
--        record_revisions 는 행 1개 단위지만, 여기서는 폴더(테이블) 전체 행을
--        한 시점으로 통째로 저장해, 그 시점으로 폴더 전체를 되돌릴 수 있게 한다.
-- ============================================================================

create table if not exists public.folder_snapshots (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,             -- 예: ceo_todos, reminders, contacts, meetings
  scope       text not null default 'ceo', -- 'ceo' | 'staff'
  rows        jsonb not null,            -- 그 시점의 전체 행(배열)
  row_count   int  not null default 0,
  note        text,                      -- '자동 백업'/'수동 백업'/'복원 전' 등
  created_at  timestamptz not null default now()
);
create index if not exists folder_snap_idx on public.folder_snapshots(entity, created_at desc);

alter table public.folder_snapshots enable row level security;
-- 서버 액션에서는 service_role 로 다루지만, RLS 로도 대표/직원에게만 허용해 둔다.
drop policy if exists folder_snap_rw on public.folder_snapshots;
create policy folder_snap_rw on public.folder_snapshots for all to authenticated
  using (public.current_user_is_ceo() or public.current_app_role() in ('owner','staff'))
  with check (public.current_user_is_ceo() or public.current_app_role() in ('owner','staff'));
