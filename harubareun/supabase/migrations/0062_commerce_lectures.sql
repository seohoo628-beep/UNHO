-- ============================================================================
-- 0062 — 커머스강의 자료 폴더. 강의 파일·링크·메모 보관.
-- ============================================================================

create table if not exists public.commerce_lectures (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text,                       -- 강의명/플랫폼/분류
  note        text,
  link        text,
  files       jsonb not null default '[]'::jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists commerce_lectures_created_idx on public.commerce_lectures(created_at desc);

alter table public.commerce_lectures enable row level security;
drop policy if exists commerce_lectures_all on public.commerce_lectures;
create policy commerce_lectures_all on public.commerce_lectures for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
