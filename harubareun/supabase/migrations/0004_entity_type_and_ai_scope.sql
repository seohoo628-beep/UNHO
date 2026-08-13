-- ============================================================================
-- 0004 — corporations.entity_type 추가 + AI 자동 생성 대상 축소
--
-- 이미 0001~0003 이 적용된 DB를 최신 상태로 수렴시킨다(전방 마이그레이션).
-- 신규 설치는 0001(컬럼)·0003(시드)에 이미 반영돼 있어 여기서는 멱등하게 동작한다.
-- ============================================================================

-- 1) entity_type (own/partner) 컬럼 추가
alter table public.corporations
  add column if not exists entity_type text not null default 'own'
  check (entity_type in ('own', 'partner'));

-- 2) 법인 구분: 하루바른㈜ = own (자사)
update public.corporations set entity_type = 'own'
 where name in ('하루바른㈜');

-- 3) AI 자동 생성 대상 — 하루바른(hb)·나아(na) 모두 포함
update public.brands set ai_enabled = true
 where slug in ('hb', 'na');
