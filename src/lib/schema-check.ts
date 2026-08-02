import { createSupabaseServiceClient } from "@/lib/supabase/service";

// 앱이 요구하는 테이블 목록 (경리·HR·운영 기능)
export const REQUIRED_TABLES: { table: string; label: string }[] = [
  { table: "staff_directory", label: "직원관리" },
  { table: "leave_members", label: "연차 · 직원" },
  { table: "leave_usages", label: "연차 · 사용내역" },
  { table: "manager_logs", label: "경영지원 업무일지" },
  { table: "manager_incentives", label: "경영지원 인센티브" },
  { table: "app_accounts", label: "계정 ID·PW" },
  { table: "product_assets", label: "제품 이미지·영상 자료" },
  { table: "receivables", label: "미수금" },
  { table: "payables", label: "미지급금" },
  { table: "meetings", label: "미팅·회의 일지" },
  { table: "daily_checks", label: "일일 체크리스트" },
];

export async function checkTables(): Promise<{ table: string; label: string; ok: boolean }[]> {
  const svc = createSupabaseServiceClient();
  // 병렬 점검 (순차 대비 빠름)
  return Promise.all(
    REQUIRED_TABLES.map(async (t) => {
      let ok = true;
      try {
        const { error } = await svc.from(t.table).select("*", { head: true, count: "exact" }).limit(1);
        if (error) ok = false;
      } catch {
        ok = false;
      }
      return { ...t, ok };
    })
  );
}

// 한 번에 전부 생성/보정하는 idempotent SQL (Supabase SQL Editor에 붙여넣고 실행)
export const SETUP_ALL_SQL = `-- 운호컴퍼니 운영 플랫폼 — 경리·HR·운영 테이블 일괄 설정 (여러 번 실행해도 안전)

create table if not exists public.staff_directory (
  id uuid primary key default gen_random_uuid(),
  name text not null, position text, hire_date date,
  salary bigint default 0, phone text, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leave_members (
  id uuid primary key default gen_random_uuid(),
  name text not null, join_date date not null,
  carryover numeric not null default 0, note text,
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.leave_usages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.leave_members(id) on delete cascade,
  use_date date not null,
  type text not null default '연차' check (type in ('연차','반차(오전)','반차(오후)')),
  approver text, note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.manager_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  category text not null, task text not null,
  status text not null default '예정', note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.manager_incentives (
  id uuid primary key default gen_random_uuid(),
  month text not null unique,
  gonggu_count integer not null default 0,
  gonggu_sales bigint not null default 0,
  promo_sales bigint not null default 0,
  rate_pct numeric not null default 5, note text,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_accounts (
  id uuid primary key default gen_random_uuid(),
  service text not null, purpose text,
  login_id text, password text, url text, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null, kind text not null default '이미지',
  brand text, link text, thumb_url text, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  counterparty text not null, item text,
  billed bigint not null default 0, received bigint not null default 0,
  bill_date date, due_date date, note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.payables (
  id uuid primary key default gen_random_uuid(),
  counterparty text not null, item text,
  amount bigint not null default 0, paid bigint not null default 0,
  bill_date date, due_date date, note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null, meeting_type text not null default '내부',
  meeting_date date, attendees text, location text,
  body text, ai_summary text, file_path text, file_name text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_checks (
  check_date date not null, item_key text not null,
  done boolean not null default false, note text,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (check_date, item_key)
);

-- RLS + 정책 (owner·staff 전체 접근)
do $$
declare t text;
begin
  foreach t in array array['staff_directory','leave_members','leave_usages','manager_logs','manager_incentives','app_accounts','product_assets','receivables','payables','meetings','daily_checks']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.current_app_role() in (''owner'',''staff'')) with check (public.current_app_role() in (''owner'',''staff''));', t||'_all', t);
  end loop;
end $$;

-- 미지급금 정기 지급(원금·이자·주기·종료일) 컬럼
alter table public.payables add column if not exists principal bigint not null default 0;
alter table public.payables add column if not exists interest bigint not null default 0;
alter table public.payables add column if not exists component text;
alter table public.payables add column if not exists frequency text not null default '없음';
alter table public.payables add column if not exists period_amount bigint not null default 0;
alter table public.payables add column if not exists has_end boolean not null default false;
alter table public.payables add column if not exists end_date date;

-- 파일 업로드용 스토리지 권한(generated-media 공개 버킷)
insert into storage.buckets (id, name, public) values ('generated-media','generated-media', true)
  on conflict (id) do update set public = true;
drop policy if exists "media_auth_insert" on storage.objects;
create policy "media_auth_insert" on storage.objects for insert to authenticated with check (bucket_id = 'generated-media');
drop policy if exists "media_auth_update" on storage.objects;
create policy "media_auth_update" on storage.objects for update to authenticated using (bucket_id = 'generated-media') with check (bucket_id = 'generated-media');
drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects for select to public using (bucket_id = 'generated-media');`;
