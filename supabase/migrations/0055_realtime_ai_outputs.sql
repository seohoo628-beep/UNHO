-- ============================================================================
-- 0055 — 실시간 반영에 ai_outputs 추가. 새 AI 콘텐츠 승인건이 생기면
--   대표 승인 배지가 자동 갱신되도록 퍼블리케이션에 등록.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_outputs'
  ) then
    execute 'alter publication supabase_realtime add table public.ai_outputs';
  end if;
end $$;
