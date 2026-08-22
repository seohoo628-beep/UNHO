-- ============================================================================
-- 0088 — 경쟁 제품 리뷰수 스냅샷 (서버 공유).
--
-- 판매건수는 어느 공개 API 에도 없어 리뷰 증분으로 추정한다. 지금까지는
-- 스냅샷이 브라우저(문서 상태)에만 남아, 같은 브라우저에서 같은 문서를 다시
-- 열어 검색해야만 증분이 나왔다. 여기로 옮기면 누가 언제 어디서 검색했든
-- 링크 단위로 쌓이고, 하루만 지나면 모든 검색에서 판매건수 추정이 나온다.
--
-- 검색이 일어날 때마다 그날 값을 upsert 한다(하루 한 줄). 이후 정기 작업이
-- 저장된 문서의 키워드를 주기적으로 재검색해 사람이 안 눌러도 쌓이게 한다.
-- ============================================================================

create table if not exists public.review_snapshots (
  link         text not null,                  -- 11번가 상세페이지 URL (상품 식별자)
  captured_on  date not null default current_date,
  title        text,
  reviews      integer not null,
  price        integer,
  primary key (link, captured_on)
);
create index if not exists idx_rs_link on public.review_snapshots(link, captured_on desc);

alter table public.review_snapshots enable row level security;

drop policy if exists rs_all on public.review_snapshots;
create policy rs_all on public.review_snapshots
  for all
  using (public.current_app_role() in ('owner', 'staff'))
  with check (public.current_app_role() in ('owner', 'staff'));
