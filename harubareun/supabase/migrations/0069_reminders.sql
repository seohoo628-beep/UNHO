-- ============================================================================
-- 0069 — 리마인드(대표 개인). CEO 본인만 접근. CEO 투두의 '리마인드' 우선순위 항목 이관.
-- ============================================================================

-- 0054 미적용 대비 함수 보장(멱등).
create or replace function public.current_user_is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_ceo from public.users where auth_id = auth.uid() and active = true limit 1), false);
$$;

create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  cat         text,
  done        boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.reminders enable row level security;
drop policy if exists reminders_ceo on public.reminders;
create policy reminders_ceo on public.reminders
  for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());

-- 1) CEO 투두에 저장돼 있던 '리마인드' 항목을 리마인드로 이관(편집·완료상태 보존) 후 삭제.
insert into public.reminders (text, cat, done)
  select text, cat, coalesce(done, false)
  from public.ceo_todos where pri = '리마인드';
delete from public.ceo_todos where pri = '리마인드';

-- 2) 위에서 이관된 게 없고(리마인드 테이블이 비어 있으면) 기본 리마인드 목록을 시드.
insert into public.reminders (text, cat)
  select v.text, v.cat from (values
    ('무조건 아침 9시 출근. AI 적극 활용. 김혜정대표 라이브협업+공동 제품개발, 매일 상세페이지·리뷰점검·채널유입 구매전환 재구매 이벤트에 집중, sns 콘텐츠 기획', '제품·브랜드'),
    ('뷰티밤·리앤밤·주당의비결·운호컴퍼니·대운·신미집 홈페이지 / 네이버·구글 seo 최적화. 제품 리뷰 1000개 이상씩 확보', '제품·브랜드'),
    ('운동, 수철 투두 작성, 영어공부, 오타이산·무당티 챙겨먹기, 독서, 보컬, 댄스, 요가, 정리정돈, 청결, 디바이스 아침저녁, 비강공명, 프로페시아·미녹시딜·메디키넷', '개인·건강'),
    ('대운목장, 신미집 미리 도입. 바로.', 'F&B 운영'),
    ('미리랑 주당의비결 협업. 미리에서 영업해서 RS', null),
    ('매출 & 이익 만들기. UC, F&B', '투자·자금'),
    ('공구 지속 어레인지, 장효윤 잘팔리게, 아마존·큐텐 재팬 집중', '유통·영업'),
    ('큐텐 재팬 시작. 치히로, 리호', null),
    ('집요하게 파기. 될때까지. 답 안보이면 과감하게 접기.', null),
    ('밥이랑 면 끊기', null),
    ('건강한 원료가 중요한 게 아니다. 무조건 맛. 대중이 이미 좋아하는 걸 좀 더 건강하게 만들자가 포인트. 식품 제조공장 인수.', null),
    ('치과 빨리. 집 빨리 내놓기. 이사업체 빨리', null),
    ('친한 사람들이랑 비즈니스 관계 엮지 말기', null),
    ('미스더필 최유정, 변정수 자료 활용.', null),
    ('미스더필 기미 키워드로 임상 특허받기. 골퍼·캐디·테니스', null),
    ('레드폴 한남 3주마다. 포마드 많이. 향수 하루 3번', null),
    ('형들·동생들한테 항상 예의있고 매너있고 배려있게. 유쾌하게 농담은 하되.', null),
    ('염동진쌤 협업', null),
    ('일본 은희누나 만나러 방문', null),
    ('강인이형 야구단', null),
    ('하키, 연예인야구단 열심히 나가기', null),
    ('에이미, 게이들 디바이스', null),
    ('경남제약 제안서 작성', null),
    ('대운목장, 신미집 오픈 파티 초대. 컨텐츠 촬영', null),
    ('SL라이프 일·한 올영·돈키호테 워킹', '유통·영업'),
    ('회사·개인 신용평가 등급 올리기', '개인·건강'),
    ('솔선수범 — 빨리 출근·늦게 퇴근', '개인·건강'),
    ('철저한 성과급 체계 구성', '원칙·전략')
  ) as v(text, cat)
  where not exists (select 1 from public.reminders);
