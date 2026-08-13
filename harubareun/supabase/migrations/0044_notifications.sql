-- ============================================================================
-- 0044 — 통합 알림센터 + 모바일 웹푸시(플로우 레퍼런스).
--   notifications        : 인앱 알림(내 업무 배정/멘션/마감 등)
--   push_subscriptions   : PWA 웹푸시 구독 정보
-- ============================================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,  -- 받는 사람
  type        text not null default 'general',   -- todo_assigned|mention|todo_due|leave|general
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notif_user_time_idx on public.notifications(user_id, created_at desc);
create index if not exists notif_user_unread_idx on public.notifications(user_id, read_at);

alter table public.notifications enable row level security;
-- 본인 알림만 조회/수정(읽음 처리). 생성은 서버(service role)가 담당.
drop policy if exists notif_select_own on public.notifications;
create policy notif_select_own on public.notifications for select to authenticated
  using (user_id = public.current_user_id());
drop policy if exists notif_update_own on public.notifications;
create policy notif_update_own on public.notifications for update to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());
drop policy if exists notif_delete_own on public.notifications;
create policy notif_delete_own on public.notifications for delete to authenticated
  using (user_id = public.current_user_id());

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists push_sub_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_sub_own on public.push_subscriptions;
create policy push_sub_own on public.push_subscriptions for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());
