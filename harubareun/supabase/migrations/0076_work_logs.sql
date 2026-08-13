-- ============================================================================
-- 0076 — 마케터 / BM / MD 업무일지. designer_logs·manager_logs 와 동일 구조.
--        일일업무일지 / 주간업무계획 / 월간업무계획 + 날짜·메모·다중 첨부.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array['marketer_logs','bm_logs','md_logs'] loop
    execute format($f$
      create table if not exists public.%I (
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
    $f$, t);
    execute format('create index if not exists %I on public.%I(kind);', t||'_kind_idx', t);
    execute format('create index if not exists %I on public.%I(log_date desc);', t||'_date_idx', t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_all', t);
    execute format($p$
      create policy %I on public.%I for all to authenticated
        using (public.current_app_role() in ('owner','staff'))
        with check (public.current_app_role() in ('owner','staff'));
    $p$, t||'_all', t);
  end loop;
end $$;
