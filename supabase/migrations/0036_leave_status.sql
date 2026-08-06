-- ============================================================================
-- 0036 — 연차 신청 승인 흐름. leave_usages 에 status 추가.
-- 직원이 신청하면 pending, 대표가 승인하면 approved(잔여에서 차감), 반려는 rejected.
-- 기존 기록은 approved 로 간주(default 'approved').
-- ============================================================================

alter table public.leave_usages
  add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));

-- 신청자/결재자 기록(선택)
alter table public.leave_usages add column if not exists requested_by uuid references public.users(id) on delete set null;
alter table public.leave_usages add column if not exists decided_by uuid references public.users(id) on delete set null;
alter table public.leave_usages add column if not exists decided_at timestamptz;
