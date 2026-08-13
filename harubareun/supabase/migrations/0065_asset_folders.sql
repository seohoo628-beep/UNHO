-- ============================================================================
-- 0065 — 각종 자료 폴더 목록(빈 폴더도 만들 수 있도록 별도 저장).
-- ============================================================================

create table if not exists public.asset_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

alter table public.asset_folders enable row level security;
drop policy if exists asset_folders_all on public.asset_folders;
create policy asset_folders_all on public.asset_folders for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
