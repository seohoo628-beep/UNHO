-- 0021_meetings.sql — 미팅·회의 일지
-- 첨부파일은 기존 공개 버킷 'generated-media' (meeting-files/ 경로)를 재사용한다.

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_type text not null default '내부',   -- 외부 / 내부
  meeting_date date,
  attendees text,
  location text,
  body text,                                    -- 직접 작성한 원문
  ai_summary text,                              -- AI가 정리한 회의록
  file_path text,                               -- generated-media 내 경로
  file_name text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_date_idx on public.meetings(meeting_date desc);

alter table public.meetings enable row level security;
drop policy if exists meetings_all on public.meetings;
create policy meetings_all on public.meetings for all to authenticated
  using (public.current_app_role() in ('owner','staff'))
  with check (public.current_app_role() in ('owner','staff'));
