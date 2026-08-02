-- ============================================================
-- STARZ 아이스하키팀 플랫폼 · 공유 모드 설치 SQL
-- Supabase → SQL Editor 에 그대로 붙여넣고 Run 하세요. (한 번만)
-- 기존 운호 프로젝트를 그대로 재사용해도 됩니다. (아래 표/버킷은 starz_ 로 격리)
-- ============================================================

-- 1) 문서 저장 테이블 (멤버/출석/공지/일정/자료 메타를 JSON 문서로 저장)
create table if not exists public.starz_docs (
  collection text not null,
  doc_id     text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, doc_id)
);

-- 2) 실시간(Realtime) 켜기 — 팀원 화면이 자동 갱신됨
alter table public.starz_docs replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'starz_docs'
  ) then
    alter publication supabase_realtime add table public.starz_docs;
  end if;
end $$;

-- 3) 접근 권한(RLS) — 팀 내부용 공개 접근 (익명 키로 읽기/쓰기 허용)
--    ※ 링크+anon 키를 아는 사람은 접근 가능합니다. 팀 내부에서만 공유하세요.
alter table public.starz_docs enable row level security;
drop policy if exists "starz_docs public access" on public.starz_docs;
create policy "starz_docs public access" on public.starz_docs
  for all to anon, authenticated using (true) with check (true);

-- 4) 사진/영상 저장용 스토리지 버킷 (공개 읽기)
insert into storage.buckets (id, name, public)
values ('starz-media', 'starz-media', true)
on conflict (id) do update set public = true;

-- 5) 버킷 접근 정책 (starz-media 한정 읽기/쓰기/삭제 허용)
drop policy if exists "starz-media read"   on storage.objects;
drop policy if exists "starz-media write"  on storage.objects;
drop policy if exists "starz-media delete" on storage.objects;
create policy "starz-media read"   on storage.objects for select
  to anon, authenticated using (bucket_id = 'starz-media');
create policy "starz-media write"  on storage.objects for insert
  to anon, authenticated with check (bucket_id = 'starz-media');
create policy "starz-media update" on storage.objects for update
  to anon, authenticated using (bucket_id = 'starz-media') with check (bucket_id = 'starz-media');
create policy "starz-media delete" on storage.objects for delete
  to anon, authenticated using (bucket_id = 'starz-media');

-- 완료! 이제 public/starz/config.js 에 Project URL 과 anon 키를 넣으면 공유 모드가 켜집니다.
