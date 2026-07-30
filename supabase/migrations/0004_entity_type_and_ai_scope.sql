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

-- 2) 법인 구분: 운호컴퍼니·뷰티밤 = own, SBJ컴퍼니·엣지라인의원 = partner
update public.corporations set entity_type = 'own'
 where name in ('㈜운호컴퍼니', '뷰티밤㈜');

update public.corporations set entity_type = 'partner'
 where name in ('SBJ컴퍼니', '엣지라인의원');

-- 3) AI 자동 생성 대상은 6개 브랜드만 유지, 나머지는 전부 제외
--    유지: 리앤밤(rb) 주당의비결(jd) 슈퍼릴라(sr) 뷰티밤(bb) 대운목장(dw) 신미집(sm)
update public.brands set ai_enabled = true
 where slug in ('rb', 'jd', 'sr', 'bb', 'dw', 'sm');

update public.brands set ai_enabled = false
 where slug not in ('rb', 'jd', 'sr', 'bb', 'dw', 'sm');
