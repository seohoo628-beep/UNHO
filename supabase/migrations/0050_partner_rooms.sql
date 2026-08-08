-- ============================================================================
-- 0050 — 파트너별 분리(회사별 방). 게스트는 자기 소속 회사 방만 열람/작성.
-- ============================================================================

create table if not exists public.partner_companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.partner_companies enable row level security;
drop policy if exists partner_companies_select on public.partner_companies;
create policy partner_companies_select on public.partner_companies for select to authenticated
  using (public.current_app_role() in ('owner','staff','guest'));
drop policy if exists partner_companies_write on public.partner_companies;
create policy partner_companies_write on public.partner_companies for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

-- 사용자(게스트)의 소속 파트너 회사.
alter table public.users add column if not exists partner_id uuid references public.partner_companies(id) on delete set null;

-- 게시물의 소속 파트너 회사.
alter table public.partner_posts add column if not exists partner_id uuid references public.partner_companies(id) on delete set null;
create index if not exists partner_posts_partner_idx on public.partner_posts(partner_id);

-- 조회: 대표·직원 전체 / 게스트는 자기 회사 방만.
drop policy if exists partner_posts_select on public.partner_posts;
create policy partner_posts_select on public.partner_posts for select to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or (public.current_app_role() = 'guest'
        and partner_id = (select u.partner_id from public.users u where u.id = public.current_user_id()))
  );

-- 작성: 대표·직원 / 게스트는 자기 회사 방으로만.
drop policy if exists partner_posts_insert on public.partner_posts;
create policy partner_posts_insert on public.partner_posts for insert to authenticated
  with check (
    public.current_app_role() in ('owner','staff')
    or (public.current_app_role() = 'guest'
        and partner_id = (select u.partner_id from public.users u where u.id = public.current_user_id()))
  );
