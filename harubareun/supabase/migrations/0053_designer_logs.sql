-- ============================================================================
-- 0053 — 디자이너 업무일지. 일일업무일지 / 주간업무계획 / 월간업무계획을
--        날짜·메모·다중 첨부파일과 함께 올린다.
-- ============================================================================

create table if not exists public.designer_logs (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default '일일업무일지'
                 check (kind in ('일일업무일지','주간업무계획','월간업무계획')),
  log_date       date not null default (now() at time zone 'Asia/Seoul')::date,
  title          text,
  note           text,
  files          jsonb not null default '[]'::jsonb,
  author_user_id uuid references public.users(id) on delete set null,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists designer_logs_kind_idx on public.designer_logs(kind);
create index if not exists designer_logs_date_idx on public.designer_logs(log_date desc);

alter table public.designer_logs enable row level security;
drop policy if exists designer_logs_all on public.designer_logs;
create policy designer_logs_all on public.designer_logs for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
