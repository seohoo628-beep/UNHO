-- ============================================================================
-- 0081 — 업무일지(designer_logs)를 역할별로 공유하기 위해 role 컬럼 추가.
--        디자이너 외 MD·BM·PD·마케터·총괄이사 등 역할별 탭에서 같은 테이블 사용.
-- ============================================================================

alter table public.designer_logs add column if not exists role text not null default '디자이너';
create index if not exists designer_logs_role_idx on public.designer_logs(role, log_date desc);
