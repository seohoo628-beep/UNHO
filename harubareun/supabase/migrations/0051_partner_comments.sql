-- ============================================================================
-- 0051 — 파트너 협업 게시물 댓글(양방향). 볼 수 있는 게시물에만 댓글 가능.
-- ============================================================================

create table if not exists public.partner_post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.partner_posts(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists partner_comments_post_idx on public.partner_post_comments(post_id);

alter table public.partner_post_comments enable row level security;

-- 부모 게시물을 볼 수 있는 사람만 댓글 열람/작성 가능.
drop policy if exists partner_comments_select on public.partner_post_comments;
create policy partner_comments_select on public.partner_post_comments for select to authenticated
  using (
    exists (
      select 1 from public.partner_posts p
      where p.id = post_id
        and (
          public.current_app_role() in ('owner','staff')
          or (public.current_app_role() = 'guest'
              and p.partner_id = (select u.partner_id from public.users u where u.id = public.current_user_id()))
        )
    )
  );

drop policy if exists partner_comments_insert on public.partner_post_comments;
create policy partner_comments_insert on public.partner_post_comments for insert to authenticated
  with check (
    exists (
      select 1 from public.partner_posts p
      where p.id = post_id
        and (
          public.current_app_role() in ('owner','staff')
          or (public.current_app_role() = 'guest'
              and p.partner_id = (select u.partner_id from public.users u where u.id = public.current_user_id()))
        )
    )
  );

-- 삭제: 본인 댓글 또는 대표·직원.
drop policy if exists partner_comments_delete on public.partner_post_comments;
create policy partner_comments_delete on public.partner_post_comments for delete to authenticated
  using (
    public.current_app_role() in ('owner','staff')
    or user_id = public.current_user_id()
  );
