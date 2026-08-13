-- ============================================================================
-- 0048 — 실시간 반영. 주요 테이블을 supabase_realtime 퍼블리케이션에 추가.
--   (이미 추가돼 있으면 건너뛴다. 미실행 시엔 기존 폴링/수동 새로고침으로 동작)
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array['todos','todo_comments','notifications','ceo_todos','approval_requests'];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
