import type { AppData } from "./types";

// 시드 데이터 — 외부 DB 없이 즉시 동작하는 예시 데이터.
// 브라우저 localStorage에 1회 하이드레이션 후, 사용자가 편집한 내용이 유지됩니다.
// 두 매장: chdo(청담 오리닭) / euwb(은우 더 블랙)

export const SEED: AppData = {
  // ── 운영기획: 목표 ──────────────────────────────
  // 미오픈 상태 — 목표 매출만 설정, 실적(actual)은 오픈 후 입력.
  goals: [
    { id: "g1", storeId: "chdo", period: "2026-08", title: "월 매출 목표", metric: "매출", target: 500_000_000, actual: 0, unit: "원" },
    { id: "g2", storeId: "chdo", period: "2026-08", title: "식자재 원가율", metric: "원가율", target: 33, actual: 0, unit: "%" },
    { id: "g5", storeId: "euwb", period: "2026-08", title: "월 매출 목표", metric: "매출", target: 200_000_000, actual: 0, unit: "원" },
    { id: "g6", storeId: "euwb", period: "2026-08", title: "객단가", metric: "객단가", target: 85_000, actual: 0, unit: "원" },
    { id: "g9", storeId: "sbgb", period: "2026-08", title: "월 매출 목표", metric: "매출", target: 150_000_000, actual: 0, unit: "원" },
    { id: "g10", storeId: "sbgb", period: "2026-08", title: "식자재 원가율", metric: "원가율", target: 32, actual: 0, unit: "%" },
  ],

  // ── 운영기획: 액션 태스크 ────────────────────────
  tasks: [
    { id: "t1", storeId: "chdo", title: "여름 보양 신메뉴(오리백숙) 원가 확정", owner: "김점장", due: "2026-08-05", priority: "high", status: "doing", category: "메뉴" },
    { id: "t2", storeId: "chdo", title: "주방 후드 정기청소 업체 예약", owner: "박주방", due: "2026-08-08", priority: "mid", status: "todo", category: "시설" },
    { id: "t3", storeId: "chdo", title: "홀 서버 서비스 매뉴얼 재교육", owner: "김점장", due: "2026-08-03", priority: "mid", status: "todo", category: "CS" },
    { id: "t4", storeId: "chdo", title: "위생 자가점검표 7월분 마감", owner: "박주방", due: "2026-07-31", priority: "high", status: "done", category: "위생" },
    { id: "t5", storeId: "euwb", title: "8월 와인 리스트 개편(내추럴 5종 추가)", owner: "이매니저", due: "2026-08-07", priority: "high", status: "doing", category: "메뉴" },
    { id: "t6", storeId: "euwb", title: "디너 코스 플레이팅 사진 재촬영", owner: "정마케팅", due: "2026-08-10", priority: "mid", status: "todo", category: "마케팅" },
    { id: "t7", storeId: "euwb", title: "예약 노쇼 보증금 정책 도입 검토", owner: "이매니저", due: "2026-08-12", priority: "low", status: "todo", category: "운영" },
    { id: "t8", storeId: "euwb", title: "냉장 쇼케이스 온도 이상 A/S", owner: "이매니저", due: "2026-08-02", priority: "high", status: "doing", category: "시설" },
    { id: "t9", storeId: "sbgb", title: "야간조 인력 1명 충원(새벽 시간대)", owner: "최사장", due: "2026-08-06", priority: "high", status: "doing", category: "인사" },
    { id: "t10", storeId: "sbgb", title: "사골 육수 24시간 표준 레시피 재점검", owner: "정주방", due: "2026-08-04", priority: "mid", status: "todo", category: "메뉴" },
    { id: "t11", storeId: "sbgb", title: "배달앱 심야 할증·리뷰 관리", owner: "최사장", due: "2026-08-08", priority: "mid", status: "todo", category: "마케팅" },
  ],

  // ── 직원관리 ────────────────────────────────────
  staff: [],

  // 주간 근무표 (2026-07-27 월 ~ 08-02 일). 각 직원 주 1회 휴무.
  shifts: [],

  // ── 마케팅관리 ──────────────────────────────────
  campaigns: [
    { id: "c1", storeId: "chdo", name: "여름 보양 오리백숙 런칭", channel: "인스타그램", status: "running", startDate: "2026-07-25", endDate: "2026-08-15", budget: 3_000_000, spent: 1_240_000, reach: 88_000, conversions: 74, owner: "정마케팅" },
    { id: "c2", storeId: "chdo", name: "네이버 플레이스 예약 리워드", channel: "네이버", status: "running", startDate: "2026-07-01", endDate: "2026-08-31", budget: 1_500_000, spent: 820_000, reach: 22_000, conversions: 132, owner: "정마케팅" },
    { id: "c3", storeId: "chdo", name: "미식 블로거 초청 시식", channel: "블로그", status: "planned", startDate: "2026-08-12", endDate: "2026-08-20", budget: 2_000_000, spent: 0, reach: 0, conversions: 0, owner: "김점장" },
    { id: "c4", storeId: "euwb", name: "와인 페어링 디너 프로모션", channel: "인스타그램", status: "running", startDate: "2026-07-20", endDate: "2026-08-20", budget: 4_000_000, spent: 2_100_000, reach: 61_000, conversions: 58, owner: "정마케팅" },
    { id: "c5", storeId: "euwb", name: "캐치테이블 상단 노출", channel: "캐치테이블", status: "running", startDate: "2026-08-01", endDate: "2026-08-31", budget: 1_800_000, spent: 300_000, reach: 15_000, conversions: 41, owner: "이매니저" },
    { id: "c6", storeId: "euwb", name: "기념일 코스 제휴(플라워)", channel: "제휴", status: "done", startDate: "2026-06-01", endDate: "2026-06-30", budget: 1_200_000, spent: 1_150_000, reach: 9_000, conversions: 33, owner: "이매니저" },
    { id: "c7", storeId: "sbgb", name: "배달앱 심야 해장국 프로모션", channel: "배달앱", status: "running", startDate: "2026-07-20", endDate: "2026-08-20", budget: 2_000_000, spent: 940_000, reach: 52_000, conversions: 210, owner: "최사장" },
    { id: "c8", storeId: "sbgb", name: "네이버 플레이스 리뷰 이벤트", channel: "네이버", status: "running", startDate: "2026-07-01", endDate: "2026-08-31", budget: 800_000, spent: 420_000, reach: 14_000, conversions: 96, owner: "최사장" },
  ],

  // ── P&L (월별) ──────────────────────────────────
  pnl: [],

  // ── 식자재관리 ──────────────────────────────────
  ingredients: [
    { id: "i1", storeId: "chdo", name: "생오리(슬라이스)", category: "육류", unit: "kg", stock: 18, parLevel: 30, unitPrice: 14_500, vendor: "한강오리유통", lastIn: "2026-07-30" },
    { id: "i2", storeId: "chdo", name: "토종닭", category: "육류", unit: "마리", stock: 22, parLevel: 25, unitPrice: 9_800, vendor: "청계농장", lastIn: "2026-07-31" },
    { id: "i3", storeId: "chdo", name: "대파", category: "채소", unit: "kg", stock: 6, parLevel: 12, unitPrice: 3_200, vendor: "가락시장청과", lastIn: "2026-07-31" },
    { id: "i4", storeId: "chdo", name: "들깨가루", category: "소스", unit: "kg", stock: 4, parLevel: 6, unitPrice: 11_000, vendor: "우리식자재", lastIn: "2026-07-28" },
    { id: "i5", storeId: "chdo", name: "소주", category: "주류", unit: "병", stock: 96, parLevel: 120, unitPrice: 1_300, vendor: "강남주류", lastIn: "2026-07-29" },
    { id: "i6", storeId: "euwb", name: "한우 채끝", category: "육류", unit: "kg", stock: 9, parLevel: 15, unitPrice: 62_000, vendor: "프리미엄미트", lastIn: "2026-07-31" },
    { id: "i7", storeId: "euwb", name: "제철 생선(자연산)", category: "수산", unit: "kg", stock: 5, parLevel: 8, unitPrice: 38_000, vendor: "노량진직송", lastIn: "2026-07-31" },
    { id: "i8", storeId: "euwb", name: "내추럴 와인(하우스)", category: "주류", unit: "병", stock: 34, parLevel: 60, unitPrice: 21_000, vendor: "빈티지임포터", lastIn: "2026-07-27" },
    { id: "i9", storeId: "euwb", name: "발사믹(숙성)", category: "소스", unit: "병", stock: 3, parLevel: 5, unitPrice: 24_000, vendor: "구르메수입", lastIn: "2026-07-20" },
    { id: "i10", storeId: "euwb", name: "제철 채소 박스", category: "채소", unit: "박스", stock: 4, parLevel: 6, unitPrice: 45_000, vendor: "유기농팜", lastIn: "2026-08-01" },
    { id: "i11", storeId: "sbgb", name: "돼지 사골·잡뼈", category: "육류", unit: "kg", stock: 40, parLevel: 60, unitPrice: 4_500, vendor: "마장동축산", lastIn: "2026-08-01" },
    { id: "i12", storeId: "sbgb", name: "수육용 돼지머리·앞다리", category: "육류", unit: "kg", stock: 22, parLevel: 35, unitPrice: 8_500, vendor: "마장동축산", lastIn: "2026-08-01" },
    { id: "i13", storeId: "sbgb", name: "우거지", category: "채소", unit: "kg", stock: 15, parLevel: 25, unitPrice: 3_200, vendor: "가락시장청과", lastIn: "2026-07-31" },
    { id: "i14", storeId: "sbgb", name: "새우젓", category: "소스", unit: "kg", stock: 8, parLevel: 12, unitPrice: 9_000, vendor: "광천젓갈", lastIn: "2026-07-28" },
    { id: "i15", storeId: "sbgb", name: "공깃밥용 쌀(20kg)", category: "기타", unit: "포", stock: 6, parLevel: 10, unitPrice: 58_000, vendor: "농협양곡", lastIn: "2026-07-30" },
  ],

  purchaseOrders: [
    { id: "po1", storeId: "chdo", vendor: "한강오리유통", itemName: "생오리(슬라이스)", qty: 20, unit: "kg", unitPrice: 14_500, status: "ordered", orderDate: "2026-08-01", eta: "2026-08-02" },
    { id: "po2", storeId: "chdo", vendor: "가락시장청과", itemName: "대파", qty: 10, unit: "kg", unitPrice: 3_200, status: "requested", orderDate: "2026-08-01", eta: "2026-08-02" },
    { id: "po3", storeId: "euwb", vendor: "프리미엄미트", itemName: "한우 채끝", qty: 8, unit: "kg", unitPrice: 62_000, status: "ordered", orderDate: "2026-08-01", eta: "2026-08-02" },
    { id: "po4", storeId: "euwb", vendor: "빈티지임포터", itemName: "내추럴 와인(하우스)", qty: 30, unit: "병", unitPrice: 21_000, status: "requested", orderDate: "2026-08-01", eta: "2026-08-04" },
    { id: "po5", storeId: "sbgb", vendor: "마장동축산", itemName: "돼지 사골·잡뼈", qty: 40, unit: "kg", unitPrice: 4_500, status: "ordered", orderDate: "2026-08-01", eta: "2026-08-02" },
    { id: "po6", storeId: "sbgb", vendor: "가락시장청과", itemName: "우거지", qty: 15, unit: "kg", unitPrice: 3_200, status: "requested", orderDate: "2026-08-01", eta: "2026-08-02" },
  ],

  // ── 예약관리 ────────────────────────────────────
  reservations: [],

  // ── 전달사항 ────────────────────────────────────
  announcements: [
    { id: "a1", storeId: "all", title: "8월 여름휴가 근무표 확정 안내", body: "8월 둘째주~셋째주 여름휴가 근무표가 확정되었습니다. 각 매장 근무표 확인 후 이상 시 점장/매니저에게 회신 바랍니다.", author: "본사 운영팀", priority: "high", createdAt: "2026-07-30", pinned: true },
    { id: "a2", storeId: "chdo", title: "오리백숙 신메뉴 조리 표준 레시피 공유", body: "여름 보양 신메뉴 조리 표준(계량/조리시간/플레이팅)을 주방 게시판에 부착했습니다. 오픈 전 숙지 부탁드립니다.", author: "박주방", priority: "mid", createdAt: "2026-07-31", pinned: false },
    { id: "a3", storeId: "euwb", title: "냉장 쇼케이스 온도 점검 강화", body: "쇼케이스 온도 이상 발생 이력이 있어 오픈·마감 시 온도 로그를 반드시 기록해 주세요. A/S는 8/2 예정입니다.", author: "이매니저", priority: "high", createdAt: "2026-08-01", pinned: true },
    { id: "a4", storeId: "all", title: "위생 자가점검표 제출 주기 변경", body: "위생 자가점검표를 주 1회 → 주 2회(화·금) 제출로 변경합니다. 다음 주부터 적용됩니다.", author: "본사 운영팀", priority: "mid", createdAt: "2026-07-29", pinned: false },
    { id: "a5", storeId: "sbgb", title: "심야조 인수인계 체크리스트 준수", body: "야간→새벽 교대 시 육수 잔량·재료 소진·시재 인수인계를 체크리스트로 기록해 주세요. 새벽 피크 대비 사골 육수 상시 확보.", author: "최사장", priority: "high", createdAt: "2026-08-01", pinned: true },
  ],

  // ── 일매출·지출 (최근 2주) ───────────────────────
  dailySales: [],

  // ── 메뉴 (최근 30일 판매) ────────────────────────
  menus: [
    { id: "m_c1", storeId: "chdo", name: "오리 로스트 코스", category: "코스", price: 42_000, cost: 15_000, soldQty: 210 },
    { id: "m_c2", storeId: "chdo", name: "토종닭 백숙", category: "메인", price: 45_000, cost: 16_000, soldQty: 150 },
    { id: "m_c3", storeId: "chdo", name: "오리백숙(신메뉴)", category: "메인", price: 38_000, cost: 13_000, soldQty: 180 },
    { id: "m_c4", storeId: "chdo", name: "들깨 오리탕", category: "메인", price: 34_000, cost: 11_000, soldQty: 120 },
    { id: "m_c5", storeId: "chdo", name: "훈제오리 샐러드", category: "사이드", price: 24_000, cost: 8_000, soldQty: 95 },
    { id: "m_c6", storeId: "chdo", name: "소주·음료", category: "주류", price: 5_000, cost: 1_500, soldQty: 620 },
    { id: "m_e1", storeId: "euwb", name: "셰프 테이스팅 코스", category: "코스", price: 120_000, cost: 42_000, soldQty: 96 },
    { id: "m_e2", storeId: "euwb", name: "한우 채끝 스테이크", category: "메인", price: 78_000, cost: 30_000, soldQty: 140 },
    { id: "m_e3", storeId: "euwb", name: "제철 생선 요리", category: "메인", price: 62_000, cost: 24_000, soldQty: 88 },
    { id: "m_e4", storeId: "euwb", name: "트러플 파스타", category: "메인", price: 38_000, cost: 12_000, soldQty: 110 },
    { id: "m_e5", storeId: "euwb", name: "와인 페어링", category: "주류", price: 55_000, cost: 22_000, soldQty: 130 },
    { id: "m_e6", storeId: "euwb", name: "시그니처 디저트", category: "디저트", price: 18_000, cost: 5_000, soldQty: 160 },
    { id: "m_g1", storeId: "sbgb", name: "돼지국밥", category: "메인", price: 10_000, cost: 3_200, soldQty: 2_600 },
    { id: "m_g2", storeId: "sbgb", name: "순대국밥", category: "메인", price: 10_000, cost: 3_300, soldQty: 1_800 },
    { id: "m_g3", storeId: "sbgb", name: "내장국밥", category: "메인", price: 10_000, cost: 3_400, soldQty: 900 },
    { id: "m_g4", storeId: "sbgb", name: "섞어국밥", category: "메인", price: 11_000, cost: 3_600, soldQty: 1_200 },
    { id: "m_g5", storeId: "sbgb", name: "수육(중)", category: "사이드", price: 25_000, cost: 9_000, soldQty: 420 },
    { id: "m_g6", storeId: "sbgb", name: "소주·음료", category: "주류", price: 5_000, cost: 1_500, soldQty: 3_200 },
  ],
  fixedCosts: [],
};
