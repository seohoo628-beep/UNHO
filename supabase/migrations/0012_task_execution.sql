-- ============================================================================
-- 0012 — 집행(실행) 연결. 승인된 산출물을 업무로 넘긴 뒤, 실제 집행과 결과를
-- 한곳에서 처리하도록 tasks에 원본 산출물 링크와 집행 결과 필드를 추가한다.
-- ============================================================================

alter table public.tasks
  add column if not exists ai_output_id uuid references public.ai_outputs(id) on delete set null,
  add column if not exists exec_channel  text,   -- 집행 채널 (예: 스마트스토어, 인스타)
  add column if not exists exec_link     text,   -- 집행 결과 링크 (게시 URL 등)
  add column if not exists exec_note      text;  -- 집행 메모

create index if not exists idx_tasks_ai_output on public.tasks(ai_output_id);

-- tasks의 RLS 정책(owner/staff)은 0002에서 이미 설정됨 — 컬럼 추가는 정책 변경 불필요.
