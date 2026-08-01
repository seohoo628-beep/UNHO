-- ============================================================================
-- 0015 — 집행 영상 생성(Seedance/fal). 제품컷 → 영상(image-to-video).
-- 비동기 큐 작업이라 상태·요청정보·결과 URL을 업무에 저장한다.
-- ============================================================================

alter table public.tasks
  add column if not exists video_status text,                    -- queued/processing/done/failed
  add column if not exists video_url    text,                    -- 완성 영상(Storage) URL
  add column if not exists video_meta   jsonb not null default '{}'::jsonb; -- request_id·status_url·response_url·image·prompt
