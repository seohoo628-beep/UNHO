-- 맛집 저장: 매장 사진·메뉴 사진(여러 장) + 음식 카테고리(한식/중식/일식/양식/오마카세/아시아음식/기타).
alter table public.food_places add column if not exists photos jsonb not null default '[]'::jsonb;
alter table public.food_places add column if not exists menu_photos jsonb not null default '[]'::jsonb;
alter table public.food_places add column if not exists cuisine text;
