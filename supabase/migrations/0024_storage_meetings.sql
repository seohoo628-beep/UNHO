-- 0024_storage_meetings.sql
-- 미팅 첨부파일을 브라우저에서 직접 업로드할 수 있도록 storage 권한을 연다.
-- (기존 generated-media 공개 버킷 재사용. 서버 우회 → 대용량·모바일 사진/녹음 업로드 가능)

insert into storage.buckets (id, name, public)
values ('generated-media', 'generated-media', true)
on conflict (id) do update set public = true;

-- 로그인(authenticated) 사용자는 업로드 가능
drop policy if exists "media_auth_insert" on storage.objects;
create policy "media_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'generated-media');

drop policy if exists "media_auth_update" on storage.objects;
create policy "media_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'generated-media')
  with check (bucket_id = 'generated-media');

-- 누구나 읽기(공개 URL)
drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects
  for select to public
  using (bucket_id = 'generated-media');
