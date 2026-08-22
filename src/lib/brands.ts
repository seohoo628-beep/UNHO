// 브랜드 태그 목록 — 단일 출처. (CEO투두·리마인드·인적자산·체크리스트 등 공용)
// 목록을 바꿀 때 이 파일만 수정하면 모든 화면에 반영된다.
export const TAG_BRANDS = [
  "공통",
  "운호컴퍼니",
  "리앤밤",
  "뷰티밤",
  "주당의비결",
  "파트너사",
  "F&B",
  "하루바른",
  "나아",
  "기타",
] as const;

export type TagBrand = (typeof TAG_BRANDS)[number];
