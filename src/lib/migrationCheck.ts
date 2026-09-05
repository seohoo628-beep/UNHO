import { createSupabaseServiceClient } from "@/lib/supabase/service";

// ─────────────────────────────────────────────────────────────
// 최근 마이그레이션(0076~0085) 적용 여부 자동 점검.
// 테이블 유무 + 컬럼 유무를 실제 쿼리로 확인해, 미적용 항목의
// SQL만 골라 안내한다. (SQL은 전부 idempotent — 여러 번 실행 안전)
// ─────────────────────────────────────────────────────────────

type Check =
  | { kind: "table"; table: string }
  | { kind: "column"; table: string; column: string };

export type MigrationDef = {
  id: string;           // 예: "0083"
  name: string;         // 사람이 읽는 이름
  feature: string;      // 미적용 시 빠지는 기능 설명
  checks: Check[];
  sql: string;          // 붙여넣어 실행할 SQL
};

export const MIGRATIONS: MigrationDef[] = [
  {
    id: "0076",
    name: "업무투두 공지사항",
    feature: "업무투두 상단 공지 등록·표시",
    checks: [{ kind: "table", table: "todo_notices" }],
    sql: `create table if not exists public.todo_notices (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  pinned boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
alter table public.todo_notices enable row level security;
grant all on public.todo_notices to authenticated;
drop policy if exists todo_notices_read on public.todo_notices;
create policy todo_notices_read on public.todo_notices for select to authenticated
  using (public.current_app_role() in ('owner','staff','guest'));
drop policy if exists todo_notices_write on public.todo_notices;
create policy todo_notices_write on public.todo_notices for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
create index if not exists idx_todo_notices_created on public.todo_notices (pinned desc, created_at desc);`,
  },
  {
    id: "0077",
    name: "커머스 프레임",
    feature: "브랜드 매출목표 저장·홈 목표 카드, 제품 8필터 심사 공유",
    checks: [
      { kind: "table", table: "brand_revenue_goals" },
      { kind: "table", table: "product_screenings" },
    ],
    sql: `create table if not exists public.brand_revenue_goals (
  brand text primary key,
  annual numeric not null default 0,
  staff int not null default 1,
  fixed_monthly numeric not null default 0,
  margin_pct numeric not null default 20,
  weekend_mult numeric not null default 1.3,
  updated_at timestamptz not null default now(),
  updated_by_name text
);
alter table public.brand_revenue_goals enable row level security;
grant all on public.brand_revenue_goals to authenticated;
drop policy if exists brand_revenue_goals_all on public.brand_revenue_goals;
create policy brand_revenue_goals_all on public.brand_revenue_goals for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

create table if not exists public.product_screenings (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  brand text,
  checks boolean[] not null default '{}',
  diffs text[] not null default '{}',
  passed boolean not null default false,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_screenings enable row level security;
grant all on public.product_screenings to authenticated;
drop policy if exists product_screenings_all on public.product_screenings;
create policy product_screenings_all on public.product_screenings for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
create index if not exists idx_product_screenings_created on public.product_screenings (created_at desc);`,
  },
  {
    id: "0078",
    name: "투두 하위 체크리스트",
    feature: "업무투두·CEO투두 체크리스트 저장",
    checks: [
      { kind: "column", table: "todos", column: "checklist" },
      { kind: "column", table: "ceo_todos", column: "checklist" },
    ],
    sql: `alter table public.todos add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table public.ceo_todos add column if not exists checklist jsonb not null default '[]'::jsonb;`,
  },
  {
    id: "0079",
    name: "폴더 시간대별 스냅샷",
    feature: "폴더 되돌리기·전체 복원(노션식)",
    checks: [{ kind: "table", table: "folder_snapshots" }],
    sql: `create table if not exists public.folder_snapshots (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  scope text not null default 'ceo',
  rows jsonb not null,
  row_count int not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists folder_snap_idx on public.folder_snapshots(entity, created_at desc);
alter table public.folder_snapshots enable row level security;
drop policy if exists folder_snap_rw on public.folder_snapshots;
create policy folder_snap_rw on public.folder_snapshots for all to authenticated
  using (public.current_user_is_ceo() or public.current_app_role() in ('owner','staff'))
  with check (public.current_user_is_ceo() or public.current_app_role() in ('owner','staff'));`,
  },
  {
    id: "0080",
    name: "리마인드 체크리스트",
    feature: "리마인드 하위 체크리스트 저장",
    checks: [{ kind: "column", table: "reminders", column: "checklist" }],
    sql: `alter table public.reminders add column if not exists checklist jsonb not null default '[]'::jsonb;`,
  },
  {
    id: "0081",
    name: "업무일지 역할 구분",
    feature: "MD·BM·PD·마케터·총괄이사·대표이사 업무일지 탭 분리",
    checks: [{ kind: "column", table: "designer_logs", column: "role" }],
    sql: `alter table public.designer_logs add column if not exists role text not null default '디자이너';
create index if not exists designer_logs_role_idx on public.designer_logs(role, log_date desc);`,
  },
  {
    id: "0082",
    name: "오늘의 체크리스트 사용자 항목",
    feature: "홈 체크리스트에 내 항목 추가·요일 반복",
    checks: [{ kind: "table", table: "daily_checklist_items" }],
    sql: `create table if not exists public.daily_checklist_items (
  id uuid primary key default gen_random_uuid(),
  group_name text not null default '내 항목',
  label text not null,
  href text,
  note text,
  weekdays int[],
  sort_order int not null default 0,
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.daily_checklist_items enable row level security;
drop policy if exists daily_checklist_items_all on public.daily_checklist_items;
create policy daily_checklist_items_all on public.daily_checklist_items for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
create index if not exists daily_checklist_items_active_idx on public.daily_checklist_items (active, sort_order);`,
  },
  {
    id: "0083",
    name: "개인 맞춤 설정",
    feature: "폴더 순서·카테고리 이동·즐겨찾기·숨김·체크리스트 개인화 저장",
    checks: [{ kind: "table", table: "user_prefs" }],
    sql: `create table if not exists public.user_prefs (
  user_id uuid primary key references public.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_prefs enable row level security;
drop policy if exists user_prefs_self on public.user_prefs;
create policy user_prefs_self on public.user_prefs for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());`,
  },
  {
    id: "0084",
    name: "체크리스트 항목 담당자",
    feature: "홈 체크리스트 항목별 담당자 지정·내 담당만 보기",
    checks: [{ kind: "column", table: "daily_checklist_items", column: "assignee" }],
    sql: `alter table public.daily_checklist_items add column if not exists assignee text;
create index if not exists daily_checklist_items_assignee_idx on public.daily_checklist_items (assignee);`,
  },
  {
    id: "0085",
    name: "공지 스코프 분리",
    feature: "업무투두/업무일지 공지 분리 저장",
    checks: [{ kind: "column", table: "todo_notices", column: "scope" }],
    sql: `alter table public.todo_notices add column if not exists scope text not null default 'todos';
create index if not exists todo_notices_scope_idx on public.todo_notices (scope, pinned desc, created_at desc);`,
  },
  {
    id: "0086",
    name: "재무 열람 권한 컬럼",
    feature: "미수금·미지급 열람 권한을 계정별로 관리(users.can_finance)",
    checks: [{ kind: "column", table: "users", column: "can_finance" }],
    sql: `alter table public.users add column if not exists can_finance boolean not null default false;
update public.users set can_finance = true
 where lower(coalesce(email, '')) in ('psm@unocompany.net', 'psm@unhocompany.com');`,
  },
  {
    id: "0089",
    name: "사용자 휴대폰 번호",
    feature: "마감 지연·오늘 마감 업무를 담당자에게 아침 문자 발송",
    checks: [{ kind: "column", table: "users", column: "phone" }],
    sql: `alter table public.users add column if not exists phone text;`,
  },
  {
    id: "0090",
    name: "맛집 저장(대표 전용)",
    feature: "맛집 기록·상호 자동검색 폴더",
    checks: [{ kind: "table", table: "food_places" }],
    sql: `create table if not exists public.food_places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  phone text,
  address text,
  map_url text,
  visited_on date,
  companions text,
  price text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists food_places_visited_idx on public.food_places (visited_on desc, created_at desc);
alter table public.food_places enable row level security;
drop policy if exists food_places_ceo on public.food_places;
create policy food_places_ceo on public.food_places for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());`,
  },
  {
    id: "0091",
    name: "맛집 사진·카테고리",
    feature: "매장/메뉴 사진 촬영·저장 + 음식 카테고리(한식·중식·일식 등) 필터",
    checks: [
      { kind: "column", table: "food_places", column: "photos" },
      { kind: "column", table: "food_places", column: "menu_photos" },
      { kind: "column", table: "food_places", column: "cuisine" },
    ],
    sql: `alter table public.food_places add column if not exists photos jsonb not null default '[]'::jsonb;
alter table public.food_places add column if not exists menu_photos jsonb not null default '[]'::jsonb;
alter table public.food_places add column if not exists cuisine text;`,
  },
  {
    id: "0092",
    name: "맛집 지역(동네)",
    feature: "맛집에 ○○동 지역 뱃지 표기·검색",
    checks: [{ kind: "column", table: "food_places", column: "region" }],
    sql: `alter table public.food_places add column if not exists region text;`,
  },
  {
    id: "0093",
    name: "지출계획표",
    feature: "월별 고정비·변동비 계획/실제 지출 기록 (/expense-plans)",
    checks: [{ kind: "table", table: "expense_plans" }],
    sql: `-- 0093 지출계획표: 월별 고정비·변동비 계획/실제 지출 기록
create table if not exists public.expense_plans (
  id uuid primary key default gen_random_uuid(),
  month text not null,                 -- 'YYYY-MM'
  kind text not null default '고정',    -- 고정 | 변동
  category text,                        -- 임대료/인건비/광고비 등
  name text not null,                   -- 항목명
  planned bigint not null default 0,    -- 계획 금액
  actual bigint not null default 0,     -- 실제 지출
  due_day int,                          -- 지급일(1~31)
  brand text,                           -- 브랜드 태그
  memo text,
  sort_order int not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expense_plans_month_idx on public.expense_plans(month, kind, sort_order);
alter table public.expense_plans enable row level security;
drop policy if exists expense_plans_all on public.expense_plans;
create policy expense_plans_all on public.expense_plans for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`,
  },
  {
    id: "0094",
    name: "지출계획표 회사/개인 + 가계부",
    feature: "지출계획표 회사·개인 구분, 일별 수입·지출 가계부 (/expense-plans?tab=ledger)",
    checks: [
      { kind: "column", table: "expense_plans", column: "scope" },
      { kind: "table", table: "ledger_entries" },
    ],
    sql: `-- 0094 지출계획표 회사/개인 구분 + 가계부(일별 수입·지출 장부)
alter table public.expense_plans add column if not exists scope text not null default '회사'; -- 회사 | 개인
create index if not exists expense_plans_scope_idx on public.expense_plans(scope, month, kind, sort_order);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  scope text not null default '회사',       -- 회사 | 개인
  entry_date date not null,
  type text not null default '지출',         -- 지출 | 수입
  category text,
  name text not null,
  amount bigint not null default 0,
  method text,                               -- 카드 | 현금 | 계좌이체 | 자동이체 등
  brand text,
  memo text,
  plan_id uuid references public.expense_plans(id) on delete set null, -- 연결된 지출계획 항목
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ledger_entries_date_idx on public.ledger_entries(scope, entry_date);
create index if not exists ledger_entries_plan_idx on public.ledger_entries(plan_id);
alter table public.ledger_entries enable row level security;
drop policy if exists ledger_entries_all on public.ledger_entries;
create policy ledger_entries_all on public.ledger_entries for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));`,
  },
  {
    id: "0095",
    name: "가계부 영수증 사진",
    feature: "가계부 기록에 영수증 사진 첨부",
    checks: [{ kind: "column", table: "ledger_entries", column: "photos" }],
    sql: `alter table public.ledger_entries add column if not exists photos jsonb not null default '[]'::jsonb;`,
  },
  {
    id: "0096",
    name: "가계부 반복 지출",
    feature: "매월 자동 입력되는 반복 지출·수입 규칙",
    checks: [
      { kind: "table", table: "ledger_recurrings" },
      { kind: "column", table: "ledger_entries", column: "recurring_id" },
    ],
    sql: `-- 0096 가계부 반복 지출(매월 자동 입력)
create table if not exists public.ledger_recurrings (
  id uuid primary key default gen_random_uuid(),
  scope text not null default '회사',       -- 회사 | 개인
  type text not null default '지출',         -- 지출 | 수입
  category text,
  name text not null,
  amount bigint not null default 0,
  method text,
  brand text,
  memo text,
  day_of_month int not null default 1,       -- 매월 N일 (말일보다 크면 말일)
  start_month text not null,                 -- 'YYYY-MM' 부터
  end_month text,                            -- 'YYYY-MM' 까지 (null = 계속)
  active boolean not null default true,
  skipped_months jsonb not null default '[]'::jsonb, -- 사용자가 삭제한 달(재생성 안 함)
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ledger_recurrings enable row level security;
drop policy if exists ledger_recurrings_all on public.ledger_recurrings;
create policy ledger_recurrings_all on public.ledger_recurrings for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));

alter table public.ledger_entries add column if not exists recurring_id uuid references public.ledger_recurrings(id) on delete set null;
alter table public.ledger_entries add column if not exists recurring_month text;
create unique index if not exists ledger_entries_recurring_uniq on public.ledger_entries(recurring_id, recurring_month) where recurring_id is not null;`,
  },
];

export type MigrationStatus = { def: MigrationDef; applied: boolean };

export async function checkMigrations(): Promise<{ statuses: MigrationStatus[]; pendingSql: string }> {
  const svc = createSupabaseServiceClient();

  const runCheck = async (c: Check): Promise<boolean> => {
    try {
      const sel = c.kind === "column" ? c.column : "*";
      const { error } = await svc.from(c.table).select(sel, { head: true, count: "exact" }).limit(1);
      return !error;
    } catch {
      return false;
    }
  };

  const statuses = await Promise.all(
    MIGRATIONS.map(async (def) => {
      const results = await Promise.all(def.checks.map(runCheck));
      return { def, applied: results.every(Boolean) };
    })
  );

  const pending = statuses.filter((s) => !s.applied);
  const pendingSql = pending.length
    ? `-- 운호컴퍼니 — 미적용 마이그레이션 일괄 적용 (여러 번 실행해도 안전)\n\n` +
      pending.map((s) => `-- ${s.def.id} · ${s.def.name}\n${s.def.sql}`).join("\n\n")
    : "";

  return { statuses, pendingSql };
}
