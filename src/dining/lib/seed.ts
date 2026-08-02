import type { AppData } from "./types";

// 시드 데이터 — 외부 DB 없이 즉시 동작하는 예시 데이터.
// 브라우저 localStorage에 1회 하이드레이션 후, 사용자가 편집한 내용이 유지됩니다.
// 두 매장: smjp(신미집) / dwmc(대운목장)

export const SEED: AppData = {
  // ── 운영기획: 목표 ──────────────────────────────
  goals: [
    { id: "g1", storeId: "smjp", period: "2026-08", title: "월 매출 목표", metric: "매출", target: 80_000_000, actual: 27_209_100, unit: "원" },
    { id: "g2", storeId: "smjp", period: "2026-08", title: "식자재 원가율", metric: "원가율", target: 33, actual: 34, unit: "%" },
    { id: "g3", storeId: "smjp", period: "2026-08", title: "점심 좌석 회전율", metric: "회전율", target: 35, actual: 31, unit: "회(0.1)" },
    { id: "g4", storeId: "smjp", period: "2026-08", title: "네이버 리뷰 평점", metric: "평점", target: 46, actual: 45, unit: "점(0.1)" },
    { id: "g5", storeId: "dwmc", period: "2026-08", title: "월 매출 목표", metric: "매출", target: 150_000_000, actual: 58_781_900, unit: "원" },
    { id: "g6", storeId: "dwmc", period: "2026-08", title: "객단가", metric: "객단가", target: 55_000, actual: 51_800, unit: "원" },
    { id: "g7", storeId: "dwmc", period: "2026-08", title: "디너 예약률", metric: "예약률", target: 70, actual: 58, unit: "%" },
    { id: "g8", storeId: "dwmc", period: "2026-08", title: "재방문 비율", metric: "재방문", target: 35, actual: 29, unit: "%" },
  ],

  // ── 운영기획: 액션 태스크 ────────────────────────
  tasks: [
    { id: "t1", storeId: "smjp", title: "여름 별미(콩국수) 한정 메뉴 원가 확정", owner: "정사장", due: "2026-08-05", priority: "high", status: "doing", category: "메뉴" },
    { id: "t2", storeId: "smjp", title: "점심 대기줄 회전 동선 개선", owner: "정사장", due: "2026-08-06", priority: "mid", status: "todo", category: "운영" },
    { id: "t3", storeId: "smjp", title: "반찬 리필 표준량 재교육", owner: "이주방", due: "2026-08-03", priority: "mid", status: "todo", category: "CS" },
    { id: "t4", storeId: "smjp", title: "위생 자가점검표 7월분 마감", owner: "이주방", due: "2026-07-31", priority: "high", status: "done", category: "위생" },
    { id: "t5", storeId: "dwmc", title: "8월 한우 등급별 매입 단가 재협상", owner: "강대표", due: "2026-08-07", priority: "high", status: "doing", category: "구매" },
    { id: "t6", storeId: "dwmc", title: "디너 코스 플레이팅·연출 재촬영", owner: "정마케팅", due: "2026-08-10", priority: "mid", status: "todo", category: "마케팅" },
    { id: "t7", storeId: "dwmc", title: "예약 노쇼 보증금 정책 도입 검토", owner: "강대표", due: "2026-08-12", priority: "low", status: "todo", category: "운영" },
    { id: "t8", storeId: "dwmc", title: "숯 환기·그릴 덕트 정기청소 예약", owner: "박그릴", due: "2026-08-04", priority: "high", status: "doing", category: "시설" },
  ],

  // ── 직원관리 — 구글시트 직원관리 시트 실제 명단 ─────────────────
  staff: [
    // 신미집: 2026년 중 대규모 교체(상반기 정직원 대부분 퇴사), 7월 신규 재직. 신규직 급여는 시트 미기재→추정.
    { id: "sm1", storeId: "smjp", name: "김혜민", role: "점장", phone: "010-7749-0379", employType: "매니저", status: "active", hireDate: "2026-07-06", wageType: "월급", wage: 3_500_000 },
    { id: "sm2", storeId: "smjp", name: "정세미", role: "주방직원", phone: "010-3944-9446", employType: "정직원", status: "active", hireDate: "2026-07-06", wageType: "월급", wage: 3_000_000 },
    { id: "sm5", storeId: "smjp", name: "Phing Tra My", role: "홀 알바", phone: "", employType: "파트타임", status: "active", hireDate: "2026-05-01", wageType: "시급", wage: 13_000 },
    { id: "sm3", storeId: "smjp", name: "이정희", role: "점장(전)", phone: "010-9965-7803", employType: "정직원", status: "resigned", hireDate: "2024-10-01", wageType: "월급", wage: 3_600_000 },
    { id: "sm4", storeId: "smjp", name: "조명식", role: "주방직원(전)", phone: "010-3044-4188", employType: "정직원", status: "resigned", hireDate: "2025-01-13", wageType: "월급", wage: 3_300_000 },
    // 대운목장: 2025-12 오픈, 초기 잦은 교체. 현재 재직 정직원 2명(시트 활성).
    { id: "dw1", storeId: "dwmc", name: "김정희", role: "홀점장", phone: "", employType: "매니저", status: "active", hireDate: "2026-02-23", wageType: "월급", wage: 4_200_000 },
    { id: "dw2", storeId: "dwmc", name: "김영일", role: "주방실장", phone: "", employType: "정직원", status: "active", hireDate: "2026-05-01", wageType: "월급", wage: 4_000_000 },
    { id: "dw3", storeId: "dwmc", name: "이근녕", role: "주방실장(전)", phone: "", employType: "정직원", status: "resigned", hireDate: "2026-05-03", wageType: "월급", wage: 4_200_000 },
    { id: "dw4", storeId: "dwmc", name: "유민욱", role: "홀매니저(전)", phone: "", employType: "정직원", status: "resigned", hireDate: "2026-01-12", wageType: "월급", wage: 3_700_000 },
    { id: "dw5", storeId: "dwmc", name: "진태헌", role: "주방보조(전)", phone: "", employType: "정직원", status: "resigned", hireDate: "2026-01-26", wageType: "월급", wage: 3_800_000 },
  ],

  // 주간 근무표 (2026-07-27 월 ~ 08-02 일) — 현재 재직 직원 기준. 화면에서 자유롭게 수정 가능.
  shifts: [
    { id: "shA1", storeId: "smjp", staffId: "sm1", date: "2026-07-28", start: "10:00", end: "21:00" },
    { id: "shA2", storeId: "smjp", staffId: "sm1", date: "2026-07-29", start: "10:00", end: "21:00" },
    { id: "shA3", storeId: "smjp", staffId: "sm1", date: "2026-07-30", start: "10:00", end: "21:00" },
    { id: "shA4", storeId: "smjp", staffId: "sm1", date: "2026-07-31", start: "10:00", end: "21:00" },
    { id: "shA5", storeId: "smjp", staffId: "sm1", date: "2026-08-01", start: "10:00", end: "21:00", note: "주말 피크" },
    { id: "shB1", storeId: "smjp", staffId: "sm2", date: "2026-07-28", start: "09:00", end: "20:00" },
    { id: "shB2", storeId: "smjp", staffId: "sm2", date: "2026-07-30", start: "09:00", end: "20:00" },
    { id: "shB3", storeId: "smjp", staffId: "sm2", date: "2026-07-31", start: "09:00", end: "20:00" },
    { id: "shB4", storeId: "smjp", staffId: "sm2", date: "2026-08-01", start: "09:00", end: "20:00" },
    { id: "shC1", storeId: "smjp", staffId: "sm5", date: "2026-08-01", start: "11:00", end: "15:00", note: "점심 피크" },
    { id: "shE1", storeId: "dwmc", staffId: "dw1", date: "2026-07-28", start: "11:00", end: "22:00" },
    { id: "shE2", storeId: "dwmc", staffId: "dw1", date: "2026-07-29", start: "11:00", end: "22:00" },
    { id: "shE3", storeId: "dwmc", staffId: "dw1", date: "2026-07-30", start: "11:00", end: "22:00" },
    { id: "shE4", storeId: "dwmc", staffId: "dw1", date: "2026-07-31", start: "11:00", end: "22:00" },
    { id: "shE5", storeId: "dwmc", staffId: "dw1", date: "2026-08-01", start: "11:00", end: "22:00", note: "주말 피크" },
    { id: "shF1", storeId: "dwmc", staffId: "dw2", date: "2026-07-28", start: "10:00", end: "22:00" },
    { id: "shF2", storeId: "dwmc", staffId: "dw2", date: "2026-07-29", start: "10:00", end: "22:00" },
    { id: "shF3", storeId: "dwmc", staffId: "dw2", date: "2026-07-31", start: "10:00", end: "22:00" },
    { id: "shF4", storeId: "dwmc", staffId: "dw2", date: "2026-08-01", start: "10:00", end: "22:00" },
  ],

  // ── 마케팅관리 ──────────────────────────────────
  campaigns: [
    { id: "c1", storeId: "smjp", name: "여름 콩국수 한정 릴스", channel: "인스타그램", status: "running", startDate: "2026-07-22", endDate: "2026-08-15", budget: 1_500_000, spent: 620_000, reach: 42_000, conversions: 58, owner: "정마케팅" },
    { id: "c2", storeId: "smjp", name: "네이버 플레이스 리뷰 이벤트", channel: "네이버", status: "running", startDate: "2026-07-01", endDate: "2026-08-31", budget: 900_000, spent: 480_000, reach: 16_000, conversions: 96, owner: "정사장" },
    { id: "c3", storeId: "smjp", name: "익선동 노포 기획기사 협업", channel: "블로그", status: "planned", startDate: "2026-08-12", endDate: "2026-08-20", budget: 1_000_000, spent: 0, reach: 0, conversions: 0, owner: "정마케팅" },
    { id: "c4", storeId: "dwmc", name: "한우 오마카세 디너 프로모션", channel: "인스타그램", status: "running", startDate: "2026-07-18", endDate: "2026-08-20", budget: 5_000_000, spent: 2_600_000, reach: 72_000, conversions: 64, owner: "정마케팅" },
    { id: "c5", storeId: "dwmc", name: "캐치테이블 상단 노출", channel: "캐치테이블", status: "running", startDate: "2026-08-01", endDate: "2026-08-31", budget: 2_200_000, spent: 400_000, reach: 18_000, conversions: 47, owner: "강대표" },
    { id: "c6", storeId: "dwmc", name: "목장 직영 스토리 유튜브", channel: "유튜브", status: "done", startDate: "2026-06-01", endDate: "2026-06-30", budget: 3_000_000, spent: 2_850_000, reach: 130_000, conversions: 52, owner: "정마케팅" },
  ],

  // ── P&L (월별) — 구글시트 실제 손익 기준(2026-01~05). 각 월 매출-매입합계 = 시트의 영업이익과 일치. ─────
  pnl: [
    // 신미집: 매출은 시트 대시보드 월별 추이, 매입은 매입원장 집계. 임대료는 2개월씩 납부(일부 월 0).
    { id: "p_sm1", storeId: "smjp", month: "2026-01", revenue: 28_128_900, foodCost: 15_302_774, labor: 12_865_877, rent: 0, utilities: 560_160, marketing: 0, other: 0 },
    { id: "p_sm2", storeId: "smjp", month: "2026-02", revenue: 23_119_100, foodCost: 29_787_030, labor: 14_105_593, rent: 13_420_000, utilities: 701_950, marketing: 0, other: 27_810 },
    { id: "p_sm3", storeId: "smjp", month: "2026-03", revenue: 28_689_610, foodCost: 12_653_815, labor: 16_182_056, rent: 0, utilities: 0, marketing: 0, other: 27_000 },
    { id: "p_sm4", storeId: "smjp", month: "2026-04", revenue: 25_550_600, foodCost: 11_634_925, labor: 10_381_834, rent: 0, utilities: 0, marketing: 0, other: 283_800 },
    { id: "p_sm5", storeId: "smjp", month: "2026-05", revenue: 27_209_100, foodCost: 9_196_510, labor: 16_336_340, rent: 13_420_000, utilities: 787_390, marketing: 0, other: 0 },
    // 신미집 6월: 무매출(직원 전원 교체·휴업 전환기, 시트상 매출 없음). 7월: 재오픈 부분월 — 시트 매입 미입력, 식자재만 추정 반영(영업이익 6,046,964는 시트와 일치).
    { id: "p_sm6", storeId: "smjp", month: "2026-06", revenue: 0, foodCost: 0, labor: 0, rent: 0, utilities: 0, marketing: 0, other: 0 },
    { id: "p_sm7", storeId: "smjp", month: "2026-07", revenue: 8_930_200, foodCost: 2_883_236, labor: 0, rent: 0, utilities: 0, marketing: 0, other: 0 },
    // 대운목장: 오픈 초기(2026-01) — 인테리어·셋업비가 기타(other)에 포함, 상반기 적자→5월 흑자 전환.
    { id: "p_dw1", storeId: "dwmc", month: "2026-01", revenue: 36_958_450, foodCost: 3_971_500, labor: 8_318_330, rent: 4_791_050, utilities: 619_310, marketing: 7_400_000, other: 13_591_230 },
    { id: "p_dw2", storeId: "dwmc", month: "2026-02", revenue: 58_210_260, foodCost: 26_541_400, labor: 20_313_240, rent: 5_678_200, utilities: 1_138_830, marketing: 3_600_000, other: 13_205_615 },
    { id: "p_dw3", storeId: "dwmc", month: "2026-03", revenue: 48_600_400, foodCost: 24_644_640, labor: 30_737_040, rent: 6_162_420, utilities: 12_121_290, marketing: 1_500_000, other: 5_376_810 },
    { id: "p_dw4", storeId: "dwmc", month: "2026-04", revenue: 45_819_500, foodCost: 13_129_180, labor: 34_649_910, rent: 0, utilities: 509_590, marketing: 6_300_000, other: 2_689_140 },
    { id: "p_dw5", storeId: "dwmc", month: "2026-05", revenue: 58_781_900, foodCost: 17_652_200, labor: 18_787_732, rent: 2_000_000, utilities: 1_673_650, marketing: 1_000_000, other: 8_957_110 },
    // 대운목장 6월: 매입원장 일부 미입력 → 실매입 + 정직원 인건비, 나머지는 식자재(원가)로 보정. 매출·영업이익(6,857,680)은 시트와 일치.
    { id: "p_dw6", storeId: "dwmc", month: "2026-06", revenue: 63_316_800, foodCost: 22_732_100, labor: 23_139_040, rent: 0, utilities: 4_228_790, marketing: 6_012_800, other: 346_390 },
    // 대운목장 7월: 매입원장 미입력 → 매출·영업이익(8,923,404)은 시트값, 비용 구성은 6월 구조로 추정 배분.
    { id: "p_dw7", storeId: "dwmc", month: "2026-07", revenue: 80_063_100, foodCost: 28_641_000, labor: 29_156_000, rent: 0, utilities: 5_328_500, marketing: 7_576_500, other: 437_696 },
  ],

  // ── 식자재관리 ──────────────────────────────────
  ingredients: [
    { id: "i1", storeId: "smjp", name: "국내산 앞다리살", category: "육류", unit: "kg", stock: 14, parLevel: 24, unitPrice: 9_800, vendor: "익선정육", lastIn: "2026-07-31" },
    { id: "i2", storeId: "smjp", name: "묵은지", category: "채소", unit: "kg", stock: 20, parLevel: 30, unitPrice: 4_200, vendor: "종로김치", lastIn: "2026-07-30" },
    { id: "i3", storeId: "smjp", name: "두부", category: "기타", unit: "모", stock: 18, parLevel: 40, unitPrice: 1_200, vendor: "새벽두부", lastIn: "2026-07-31" },
    { id: "i4", storeId: "smjp", name: "고등어(자반)", category: "수산", unit: "손", stock: 12, parLevel: 20, unitPrice: 3_500, vendor: "노량진직송", lastIn: "2026-07-31" },
    { id: "i5", storeId: "smjp", name: "쌀(20kg)", category: "기타", unit: "포", stock: 4, parLevel: 6, unitPrice: 58_000, vendor: "농협양곡", lastIn: "2026-07-28" },
    { id: "i6", storeId: "dwmc", name: "한우 꽃등심", category: "육류", unit: "kg", stock: 16, parLevel: 30, unitPrice: 92_000, vendor: "대운목장(직영)", lastIn: "2026-08-01" },
    { id: "i7", storeId: "dwmc", name: "한우 안창살", category: "육류", unit: "kg", stock: 8, parLevel: 15, unitPrice: 78_000, vendor: "대운목장(직영)", lastIn: "2026-08-01" },
    { id: "i8", storeId: "dwmc", name: "한우 육회용 우둔", category: "육류", unit: "kg", stock: 5, parLevel: 10, unitPrice: 62_000, vendor: "대운목장(직영)", lastIn: "2026-07-31" },
    { id: "i9", storeId: "dwmc", name: "쌈채소 세트", category: "채소", unit: "박스", stock: 6, parLevel: 10, unitPrice: 32_000, vendor: "유기농팜", lastIn: "2026-08-01" },
    { id: "i10", storeId: "dwmc", name: "소주", category: "주류", unit: "병", stock: 88, parLevel: 120, unitPrice: 1_300, vendor: "남양주주류", lastIn: "2026-07-30" },
  ],

  purchaseOrders: [
    { id: "po1", storeId: "smjp", vendor: "익선정육", itemName: "국내산 앞다리살", qty: 15, unit: "kg", unitPrice: 9_800, status: "ordered", orderDate: "2026-08-01", eta: "2026-08-02" },
    { id: "po2", storeId: "smjp", vendor: "새벽두부", itemName: "두부", qty: 30, unit: "모", unitPrice: 1_200, status: "requested", orderDate: "2026-08-01", eta: "2026-08-02" },
    { id: "po3", storeId: "dwmc", vendor: "대운목장(직영)", itemName: "한우 꽃등심", qty: 20, unit: "kg", unitPrice: 92_000, status: "ordered", orderDate: "2026-08-01", eta: "2026-08-02" },
    { id: "po4", storeId: "dwmc", vendor: "대운목장(직영)", itemName: "한우 안창살", qty: 10, unit: "kg", unitPrice: 78_000, status: "requested", orderDate: "2026-08-01", eta: "2026-08-02" },
  ],

  // ── 예약관리 ────────────────────────────────────
  reservations: [
    { id: "r1", storeId: "smjp", name: "정○○", phone: "010-3100-1111", date: "2026-08-01", time: "12:00", partySize: 4, status: "seated", channel: "워크인" },
    { id: "r2", storeId: "smjp", name: "김○○", phone: "010-3100-2222", date: "2026-08-01", time: "12:30", partySize: 2, status: "confirmed", channel: "네이버" },
    { id: "r3", storeId: "smjp", name: "이○○", phone: "010-3100-3333", date: "2026-08-01", time: "18:30", partySize: 6, status: "pending", channel: "전화", memo: "가족 모임" },
    { id: "r4", storeId: "smjp", name: "박○○", phone: "010-3100-4444", date: "2026-08-02", time: "12:30", partySize: 3, status: "confirmed", channel: "네이버" },
    { id: "r5", storeId: "smjp", name: "장○○", phone: "010-3100-5555", date: "2026-07-29", time: "12:00", partySize: 2, status: "noshow", channel: "네이버" },
    { id: "r6", storeId: "smjp", name: "윤○○", phone: "010-3100-6666", date: "2026-07-31", time: "13:00", partySize: 5, status: "seated", channel: "전화", memo: "법인 점심" },
    { id: "r7", storeId: "dwmc", name: "최○○", phone: "010-4200-1111", date: "2026-08-01", time: "18:00", partySize: 4, status: "confirmed", channel: "캐치테이블", memo: "상견례" },
    { id: "r8", storeId: "dwmc", name: "한○○", phone: "010-4200-2222", date: "2026-08-01", time: "19:00", partySize: 2, status: "confirmed", channel: "전화" },
    { id: "r9", storeId: "dwmc", name: "오○○", phone: "010-4200-3333", date: "2026-08-01", time: "19:30", partySize: 8, status: "confirmed", channel: "캐치테이블", memo: "법인 회식" },
    { id: "r10", storeId: "dwmc", name: "서○○", phone: "010-4200-4444", date: "2026-08-01", time: "20:00", partySize: 2, status: "cancelled", channel: "네이버" },
    { id: "r11", storeId: "dwmc", name: "권○○", phone: "010-4200-5555", date: "2026-07-29", time: "19:00", partySize: 4, status: "noshow", channel: "네이버" },
    { id: "r12", storeId: "dwmc", name: "황○○", phone: "010-4200-6666", date: "2026-07-31", time: "19:30", partySize: 6, status: "seated", channel: "캐치테이블", memo: "기념일" },
    { id: "r13", storeId: "dwmc", name: "문○○", phone: "010-4200-7777", date: "2026-08-02", time: "18:30", partySize: 4, status: "pending", channel: "캐치테이블", memo: "가족 외식" },
  ],

  // ── 전달사항 ────────────────────────────────────
  announcements: [
    { id: "a1", storeId: "all", title: "8월 여름휴가 근무표 확정 안내", body: "8월 둘째주~셋째주 여름휴가 근무표가 확정되었습니다. 각 매장 근무표 확인 후 이상 시 점장/매니저에게 회신 바랍니다.", author: "본사 운영팀", priority: "high", createdAt: "2026-07-30", pinned: true },
    { id: "a2", storeId: "smjp", title: "여름 별미 콩국수 조리 표준 공유", body: "한정 메뉴 콩국수 조리 표준(농도/고명/제공온도)을 주방 게시판에 부착했습니다. 오픈 전 숙지 부탁드립니다.", author: "이주방", priority: "mid", createdAt: "2026-07-31", pinned: false },
    { id: "a3", storeId: "dwmc", title: "한우 등급·부위 표기 재점검", body: "메뉴판·상차림 시 등급(1++)과 부위 표기를 정확히 해주세요. 원산지·등급 표시는 필수입니다.", author: "강대표", priority: "high", createdAt: "2026-08-01", pinned: true },
    { id: "a4", storeId: "all", title: "위생 자가점검표 제출 주기 변경", body: "위생 자가점검표를 주 1회 → 주 2회(화·금) 제출로 변경합니다. 다음 주부터 적용됩니다.", author: "본사 운영팀", priority: "mid", createdAt: "2026-07-29", pinned: false },
  ],

  // ── 일매출·지출 (최근 2주) ───────────────────────
  dailySales: [
    // 신미집 (점심 강세)
    { id: "d_s19", storeId: "smjp", date: "2026-07-19", lunch: 1_100_000, dinner: 800_000, covers: 150, purchase: 630_000, misc: 250_000 },
    { id: "d_s20", storeId: "smjp", date: "2026-07-20", lunch: 1_400_000, dinner: 800_000, covers: 168, purchase: 730_000, misc: 250_000 },
    { id: "d_s21", storeId: "smjp", date: "2026-07-21", lunch: 1_400_000, dinner: 800_000, covers: 166, purchase: 730_000, misc: 250_000 },
    { id: "d_s22", storeId: "smjp", date: "2026-07-22", lunch: 1_500_000, dinner: 900_000, covers: 176, purchase: 790_000, misc: 250_000 },
    { id: "d_s23", storeId: "smjp", date: "2026-07-23", lunch: 1_500_000, dinner: 900_000, covers: 178, purchase: 790_000, misc: 250_000 },
    { id: "d_s24", storeId: "smjp", date: "2026-07-24", lunch: 1_600_000, dinner: 1_100_000, covers: 196, purchase: 890_000, misc: 280_000 },
    { id: "d_s25", storeId: "smjp", date: "2026-07-25", lunch: 1_200_000, dinner: 900_000, covers: 158, purchase: 690_000, misc: 250_000 },
    { id: "d_s26", storeId: "smjp", date: "2026-07-26", lunch: 1_000_000, dinner: 700_000, covers: 138, purchase: 560_000, misc: 250_000 },
    { id: "d_s27", storeId: "smjp", date: "2026-07-27", lunch: 1_400_000, dinner: 800_000, covers: 166, purchase: 730_000, misc: 250_000 },
    { id: "d_s28", storeId: "smjp", date: "2026-07-28", lunch: 1_400_000, dinner: 900_000, covers: 170, purchase: 760_000, misc: 250_000 },
    { id: "d_s29", storeId: "smjp", date: "2026-07-29", lunch: 1_500_000, dinner: 900_000, covers: 176, purchase: 790_000, misc: 250_000 },
    { id: "d_s30", storeId: "smjp", date: "2026-07-30", lunch: 1_500_000, dinner: 1_000_000, covers: 182, purchase: 820_000, misc: 250_000 },
    { id: "d_s31", storeId: "smjp", date: "2026-07-31", lunch: 1_600_000, dinner: 1_100_000, covers: 198, purchase: 890_000, misc: 280_000 },
    { id: "d_s01", storeId: "smjp", date: "2026-08-01", lunch: 1_300_000, dinner: 900_000, covers: 162, purchase: 720_000, misc: 250_000 },
    // 대운목장 (저녁 강세)
    { id: "d_d19", storeId: "dwmc", date: "2026-07-19", lunch: 1_200_000, dinner: 3_200_000, covers: 82, purchase: 1_450_000, misc: 400_000 },
    { id: "d_d20", storeId: "dwmc", date: "2026-07-20", lunch: 900_000, dinner: 2_800_000, covers: 68, purchase: 1_220_000, misc: 400_000 },
    { id: "d_d21", storeId: "dwmc", date: "2026-07-21", lunch: 1_000_000, dinner: 2_900_000, covers: 72, purchase: 1_280_000, misc: 400_000 },
    { id: "d_d22", storeId: "dwmc", date: "2026-07-22", lunch: 1_000_000, dinner: 3_000_000, covers: 74, purchase: 1_320_000, misc: 400_000 },
    { id: "d_d23", storeId: "dwmc", date: "2026-07-23", lunch: 1_100_000, dinner: 3_300_000, covers: 80, purchase: 1_450_000, misc: 400_000 },
    { id: "d_d24", storeId: "dwmc", date: "2026-07-24", lunch: 1_300_000, dinner: 4_000_000, covers: 96, purchase: 1_750_000, misc: 450_000 },
    { id: "d_d25", storeId: "dwmc", date: "2026-07-25", lunch: 1_400_000, dinner: 4_200_000, covers: 100, purchase: 1_850_000, misc: 450_000 },
    { id: "d_d26", storeId: "dwmc", date: "2026-07-26", lunch: 1_300_000, dinner: 3_500_000, covers: 88, purchase: 1_580_000, misc: 420_000 },
    { id: "d_d27", storeId: "dwmc", date: "2026-07-27", lunch: 900_000, dinner: 2_700_000, covers: 66, purchase: 1_190_000, misc: 400_000 },
    { id: "d_d28", storeId: "dwmc", date: "2026-07-28", lunch: 1_000_000, dinner: 3_000_000, covers: 74, purchase: 1_320_000, misc: 400_000 },
    { id: "d_d29", storeId: "dwmc", date: "2026-07-29", lunch: 1_000_000, dinner: 3_100_000, covers: 76, purchase: 1_350_000, misc: 400_000 },
    { id: "d_d30", storeId: "dwmc", date: "2026-07-30", lunch: 1_100_000, dinner: 3_400_000, covers: 82, purchase: 1_490_000, misc: 420_000 },
    { id: "d_d31", storeId: "dwmc", date: "2026-07-31", lunch: 1_300_000, dinner: 4_100_000, covers: 98, purchase: 1_780_000, misc: 450_000 },
    { id: "d_d01", storeId: "dwmc", date: "2026-08-01", lunch: 1_400_000, dinner: 4_300_000, covers: 102, purchase: 1_900_000, misc: 450_000 },
  ],

  // ── 메뉴 (최근 30일 판매) ────────────────────────
  menus: [
    { id: "m_s1", storeId: "smjp", name: "제육백반", category: "메인", price: 11_000, cost: 3_800, soldQty: 640 },
    { id: "m_s2", storeId: "smjp", name: "김치찌개", category: "메인", price: 10_000, cost: 3_200, soldQty: 520 },
    { id: "m_s3", storeId: "smjp", name: "된장찌개", category: "메인", price: 9_000, cost: 2_800, soldQty: 410 },
    { id: "m_s4", storeId: "smjp", name: "고등어구이 정식", category: "메인", price: 13_000, cost: 4_800, soldQty: 300 },
    { id: "m_s5", storeId: "smjp", name: "계란말이", category: "사이드", price: 8_000, cost: 2_500, soldQty: 260 },
    { id: "m_s6", storeId: "smjp", name: "공기밥·음료", category: "기타", price: 2_000, cost: 500, soldQty: 900 },
    { id: "m_d1", storeId: "dwmc", name: "한우 모둠(2인)", category: "코스", price: 120_000, cost: 58_000, soldQty: 130 },
    { id: "m_d2", storeId: "dwmc", name: "한우 꽃등심(150g)", category: "메인", price: 58_000, cost: 28_000, soldQty: 210 },
    { id: "m_d3", storeId: "dwmc", name: "한우 안창살", category: "메인", price: 52_000, cost: 26_000, soldQty: 160 },
    { id: "m_d4", storeId: "dwmc", name: "한우 육회", category: "사이드", price: 32_000, cost: 14_000, soldQty: 120 },
    { id: "m_d5", storeId: "dwmc", name: "된장찌개·냉면", category: "사이드", price: 9_000, cost: 2_800, soldQty: 240 },
    { id: "m_d6", storeId: "dwmc", name: "소주·맥주", category: "주류", price: 5_000, cost: 1_500, soldQty: 700 },
  ],
};
