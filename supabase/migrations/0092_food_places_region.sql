-- 맛집 저장: 지역(동네) 표기 — 예: 성수동, 역삼동. 카카오 지번주소에서 자동 추출.
alter table public.food_places add column if not exists region text;
