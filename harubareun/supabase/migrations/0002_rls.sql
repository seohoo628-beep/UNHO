-- ============================================================================
-- Row Level Security — 역할별 격리
--
-- 원칙
--  - 대표(owner)  : 전체 열람, 승인·반려·수정요청, 브랜드·업무 편집
--  - 직원(staff)  : 전체 열람, 업무 등록·수정, 브랜드 편집, 수정요청
--  - AI(ai)       : 로그인 세션이 없다. 산출물 기록은 서버 라우트의 service_role
--                   키로만 이뤄지며 RLS를 우회한다. 따라서 브라우저 세션으로는
--                   승인·발송·금액확정이 구조적으로 불가능하다.
--
-- 승인/반려(approved/rejected)는 대표만, 수정요청(revision_requested)은 직원도
-- 가능하다. 이 세부 규칙은 서버 액션에서 역할로 한 번 더 막고, RLS는 세션 사용자
-- 본인 명의로만 이력을 남기도록 강제한다.
-- ============================================================================

-- ── 현재 세션 사용자 헬퍼 (SECURITY DEFINER 로 users RLS 재귀 방지) ──────────
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.users
   where auth_id = auth.uid() and active = true
   limit 1;
$$;

create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users
   where auth_id = auth.uid() and active = true
   limit 1;
$$;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_user_id() to authenticated;

-- ── RLS 활성화 ──────────────────────────────────────────────────────────────
alter table public.corporations      enable row level security;
alter table public.brands            enable row level security;
alter table public.users             enable row level security;
alter table public.tasks             enable row level security;
alter table public.ai_outputs        enable row level security;
alter table public.compliance_checks enable row level security;
alter table public.approvals         enable row level security;

-- ── corporations ────────────────────────────────────────────────────────────
drop policy if exists corp_select on public.corporations;
create policy corp_select on public.corporations
  for select to authenticated using (true);

drop policy if exists corp_write on public.corporations;
create policy corp_write on public.corporations
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

-- ── brands ──────────────────────────────────────────────────────────────────
drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands
  for select to authenticated using (true);

drop policy if exists brands_write on public.brands;
create policy brands_write on public.brands
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

-- ── users ───────────────────────────────────────────────────────────────────
-- 열람은 로그인 사용자 전원(담당자 이름 렌더링 필요). 편집은 대표만.
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated using (true);

drop policy if exists users_write on public.users;
create policy users_write on public.users
  for all to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');

-- ── tasks ───────────────────────────────────────────────────────────────────
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated using (true);

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'staff'));

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.current_app_role() = 'owner');

-- ── ai_outputs ──────────────────────────────────────────────────────────────
-- 열람: 로그인 사용자 전원. 생성: service_role(서버)만 — 클라이언트 insert 정책 없음.
-- 갱신: 대표·직원 (승인 결정/수정요청 반영). 승인·반려 자체의 역할 제한은 서버 액션.
drop policy if exists ai_outputs_select on public.ai_outputs;
create policy ai_outputs_select on public.ai_outputs
  for select to authenticated using (true);

drop policy if exists ai_outputs_update on public.ai_outputs;
create policy ai_outputs_update on public.ai_outputs
  for update to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
-- INSERT/DELETE 정책 없음 → authenticated 세션은 산출물을 만들거나 지울 수 없다.

-- ── compliance_checks ───────────────────────────────────────────────────────
-- 열람만 허용. 기록은 service_role(서버 검수)만.
drop policy if exists compliance_select on public.compliance_checks;
create policy compliance_select on public.compliance_checks
  for select to authenticated using (true);

-- ── approvals ───────────────────────────────────────────────────────────────
-- 열람: 전원. 기록: 대표·직원이 본인 명의로만.
drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals
  for select to authenticated using (true);

drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals
  for insert to authenticated
  with check (
    public.current_app_role() in ('owner', 'staff')
    and approver_user_id = public.current_user_id()
  );
