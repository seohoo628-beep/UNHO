-- ============================================================================
-- 0009 — 셀러/바이어 CRM. 제안→회신→성사 파이프라인 + 팔로업 관리.
-- 유통 확장 최우선 원칙을 플랫폼으로. 자사(owner/staff)만 접근.
-- ============================================================================

create table if not exists public.crm_leads (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'seller' check (kind in ('seller', 'buyer')), -- 셀러 공구 / 바이어 입점
  name           text not null,               -- 셀러명 / 바이어사명
  brand_id       uuid references public.brands(id) on delete set null,
  handle         text,                         -- 인스타·유튜브 핸들 / 회사 도메인
  contact        text,                         -- 연락처·이메일
  product        text,                         -- 매칭 제품
  stage          text not null default '발굴'
                 check (stage in ('발굴', '제안', '회신', '협의', '성사', '실패', '보류')),
  result         text check (result in ('won', 'lost')),
  source         text,                         -- 셀러시트 / 박람회 / DM 등
  owner_user_id  uuid references public.users(id) on delete set null,
  proposed_at    date,
  replied_at     date,
  closed_at      date,
  next_follow_up date,                          -- 다음 팔로업 예정일
  note           text,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_crm_stage on public.crm_leads(stage);
create index if not exists idx_crm_kind on public.crm_leads(kind);
create index if not exists idx_crm_follow on public.crm_leads(next_follow_up);

drop trigger if exists trg_crm_touch on public.crm_leads;
create trigger trg_crm_touch before update on public.crm_leads
  for each row execute function public.touch_updated_at();

alter table public.crm_leads enable row level security;

drop policy if exists crm_all on public.crm_leads;
create policy crm_all on public.crm_leads
  for all to authenticated
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
