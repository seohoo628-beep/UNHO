-- ============================================================================
-- 0049 — 파트너(게스트) 협업. guest 권한 + 파트너 협업 게시판.
--   게스트는 화이트리스트(파트너 협업 + 제품 이미지·영상 자료)만 접근.
-- ============================================================================

-- 1) guest 역할 추가(enum). 이미 있으면 무시.
alter type app_role add value if not exists 'guest';

-- 2) 파트너 협업 게시판: 대표/직원이 파일·링크·메모를 올리고 게스트는 열람.
create table if not exists public.partner_posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  link        text,
  files       jsonb not null default '[]'::jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists partner_posts_time_idx on public.partner_posts(created_at desc);

alter table public.partner_posts enable row level security;
-- 열람: 대표·직원·게스트. 작성/삭제: 대표·직원만.
drop policy if exists partner_posts_select on public.partner_posts;
create policy partner_posts_select on public.partner_posts for select to authenticated
  using (public.current_app_role() in ('owner','staff','guest'));
-- 작성(insert): 대표·직원·게스트 모두 가능.
drop policy if exists partner_posts_write on public.partner_posts;
drop policy if exists partner_posts_insert on public.partner_posts;
create policy partner_posts_insert on public.partner_posts for insert to authenticated
  with check (public.current_app_role() in ('owner','staff','guest'));
-- 수정(update): 대표·직원.
drop policy if exists partner_posts_update on public.partner_posts;
create policy partner_posts_update on public.partner_posts for update to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
-- 삭제(delete): 대표·직원 전체, 게스트는 본인 글만.
drop policy if exists partner_posts_delete on public.partner_posts;
create policy partner_posts_delete on public.partner_posts for delete to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or (public.current_app_role() = 'guest' and created_by = public.current_user_id())
  );

-- 3) 제품 이미지·영상 자료(product_assets)를 게스트도 '열람'할 수 있도록 SELECT 정책 추가(가산 정책).
drop policy if exists product_assets_guest_select on public.product_assets;
create policy product_assets_guest_select on public.product_assets for select to authenticated
  using (public.current_app_role() in ('owner','staff','guest'));
