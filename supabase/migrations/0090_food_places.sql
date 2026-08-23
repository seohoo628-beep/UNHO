-- 맛집 저장(대표 전용 폴더). 상호 검색(카카오 장소검색)으로 주소·업종·전화 자동 입력.
create table if not exists public.food_places (
  id uuid primary key default gen_random_uuid(),
  name text not null,              -- 상호
  category text,                   -- 업종(예: 한식 > 국밥)
  phone text,
  address text,
  map_url text,                    -- 카카오맵 상세 링크
  visited_on date,                 -- 언제 갔는지
  companions text,                 -- 누구랑
  price text,                      -- 가격(자유 입력: "1인 3.5만" 등)
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists food_places_visited_idx on public.food_places (visited_on desc, created_at desc);

alter table public.food_places enable row level security;
drop policy if exists food_places_ceo on public.food_places;
create policy food_places_ceo on public.food_places for all to authenticated
  using (public.current_user_is_ceo())
  with check (public.current_user_is_ceo());
