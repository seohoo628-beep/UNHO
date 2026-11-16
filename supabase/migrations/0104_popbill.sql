-- ============================================================================
-- 0104 — 팝빌 API 전자세금계산서 즉시 발행.
-- 1) 자사 법인(공급자)에 계산서용 업태·종목·담당자·담당 이메일
-- 2) 미수금에 팝빌 문서 관리번호와 마지막 발행 오류
-- 0097(세금계산서 장부) 이후 실행. 재실행 안전.
-- 팝빌 키(LinkID·SecretKey)는 DB 테이블이 아니라 설정 화면(app_settings) 또는 Vercel 환경변수에 둔다.
-- ============================================================================

alter table public.corporations add column if not exists biz_type     text; -- 업태
alter table public.corporations add column if not exists biz_item     text; -- 종목
alter table public.corporations add column if not exists tax_contact  text; -- 계산서 담당자
alter table public.corporations add column if not exists tax_email    text; -- 계산서 담당 이메일

alter table public.receivables add column if not exists popbill_mgt_key     text; -- 팝빌 문서 관리번호(중복 발행 방지)
alter table public.receivables add column if not exists invoice_issue_error text; -- 마지막 발행 실패 사유
create unique index if not exists receivables_popbill_mgt_key_uidx on public.receivables(popbill_mgt_key) where popbill_mgt_key is not null;
