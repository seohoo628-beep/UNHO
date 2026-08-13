-- ============================================================================
-- 0054 — CEO 투두를 DB 레벨에서 최운호 본인으로 격리.
--   기존 정책은 owner 역할 전체 허용이라, 다른 owner 계정이 브라우저에서
--   직접 조회하면 CEO 개인 보드가 열렸다. is_ceo 플래그 + 헬퍼 함수로 잠근다.
--
--   ⚠️ 적용 후 반드시 CEO 계정에 플래그를 켜야 한다:
--      update public.users set is_ceo = true where email = '대표이메일';
--   (플래그를 켠 계정이 없으면 아무도 CEO 투두에 접근하지 못한다.)
-- ============================================================================

alter table public.users
  add column if not exists is_ceo boolean not null default false;

-- 현재 세션 사용자가 CEO인지. SECURITY DEFINER 로 users RLS 재귀 방지.
create or replace function public.current_user_is_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_ceo from public.users
      where auth_id = auth.uid() and active = true
      limit 1),
    false);
$$;

drop policy if exists ceo_todos_owner on public.ceo_todos;
drop policy if exists ceo_todos_ceo on public.ceo_todos;
create policy ceo_todos_ceo on public.ceo_todos
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());
