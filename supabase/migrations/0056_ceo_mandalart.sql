-- ============================================================================
-- 0056 — CEO 만다라트(연꽃기법) 목표표. 9×9(81칸)을 jsonb 배열로 저장.
--   CEO 본인만 접근(0054의 current_user_is_ceo 재사용).
-- ============================================================================

-- 0054가 아직 적용 안 됐을 수도 있으므로 함수를 여기서도 보장(멱등).
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

create table if not exists public.ceo_mandalart (
  id         text primary key default 'main',
  cells      jsonb not null default '[]'::jsonb,   -- 길이 81 문자열 배열
  updated_at timestamptz not null default now()
);

alter table public.ceo_mandalart enable row level security;
drop policy if exists ceo_mandalart_ceo on public.ceo_mandalart;
create policy ceo_mandalart_ceo on public.ceo_mandalart
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());
