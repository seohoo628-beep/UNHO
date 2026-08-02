import type { AppData } from "./types";

// 시드 데이터 — 외부 DB 없이 즉시 동작하는 예시 데이터.
// 브라우저 localStorage에 1회 하이드레이션 후, 사용자가 편집한 내용이 유지됩니다.
// 두 매장: smjp(신미집) / dwmc(대운목장)

export const SEED: AppData = {
  // ── 운영기획: 목표 ──────────────────────────────
  goals: [
    { id: "g1", storeId: "smjp", period: "2026-08", title: "월 매출 목표", metric: "매출", target: 80_000_000, actual: 21_400_000, unit: "원" },
    { id: "g2", storeId: "smjp", period: "2026-08", title: "식자재 원가율", metric: "원가율", target: 33, actual: 34, unit: "%" },
    { id: "g3", storeId: "smjp", period: "2026-08", title: "점심 좌석 회전율", metric: "회전율", target: 35, actual: 31, unit: "회(0.1)" },
    { id: "g4", storeId: "smjp", period: "2026-08", title: "네이버 리뷰 평점", metric: "평점", target: 46, actual: 45, unit: "점(0.1)" },
    { id: "g5", storeId: "dwmc", period: "2026-08", title: "월 매출 목표", metric: "매출", target: 150_000_000, actual: 48_600_000, unit: "원" },
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

  // ── 직원관리 ────────────────────────────────────
  staff: [
    { id: "sm1", storeId: "smjp", name: "정사장", role: "점장", phone: "010-1100-0001", employType: "매니저", status: "active", hireDate: "2019-03-02", wageType: "월급", wage: 3_600_000 },
    { id: "sm2", storeId: "smjp", name: "이주방", role: "주방장", phone: "010-1100-0002", employType: "정직원", status: "active", hireDate: "2020-05-11", wageType: "월급", wage: 3_300_000 },
    { id: "sm3", storeId: "smjp", name: "김이모", role: "홀 서버", phone: "010-1100-0003", employType: "정직원", status: "active", hireDate: "2021-01-20", wageType: "월급", wage: 2_500_000 },
    { id: "sm4", storeId: "smjp", name: "한파트", role: "홀 파트", phone: "010-1100-0004", employType: "파트타임", status: "active", hireDate: "2025-06-01", wageType: "시급", wage: 11_500 },
    { id: "sm5", storeId: "smjp", name: "오파트", role: "주방 보조", phone: "010-1100-0005", employType: "파트타임", status: "active", hireDate: "2025-07-15", wageType: "시급", wage: 11_000 },
    { id: "dw1", storeId: "dwmc", name: "강대표", role: "매니저", phone: "010-2200-0001", employType: "매니저", status: "active", hireDate: "2022-09-01", wageType: "월급", wage: 4_200_000 },
    { id: "dw2", storeId: "dwmc", name: "박그릴", role: "그릴 마스터", phone: "010-2200-0002", employType: "정직원", status: "active", hireDate: "2022-10-05", wageType: "월급", wage: 3_900_000 },
    { id: "dw3", storeId: "dwmc", name: "윤정형", role: "정형·구매", phone: "010-2200-0003", employType: "정직원", status: "active", hireDate: "2023-02-14", wageType: "월급", wage: 3_600_000 },
    { id: "dw4", storeId: "dwmc", name: "서홀", role: "홀 서버", phone: "010-2200-0004", employType: "정직원", status: "active", hireDate: "2023-04-01", wageType: "월급", wage: 2_800_000 },
    { id: "dw5", storeId: "dwmc", name: "조파트", role: "홀 파트", phone: "010-2200-0005", employType: "파트타임", status: "active", hireDate: "2025-05-20", wageType: "시급", wage: 12_000 },
  ],

  // 주간 근무표 (2026-07-27 월 ~ 08-02 일)
  shifts: [
    { id: "shA1", storeId: "smjp", staffId: "sm1", date: "2026-07-28", start: "10:00", end: "20:00" },
    { id: "shA2", storeId: "smjp", staffId: "sm1", date: "2026-07-29", start: "10:00", end: "20:00" },
    { id: "shA3", storeId: "smjp", staffId: "sm1", date: "2026-07-30", start: "10:00", end: "20:00" },
    { id: "shA4", storeId: "smjp", staffId: "sm1", date: "2026-07-31", start: "10:00", end: "21:00" },
    { id: "shA5", storeId: "smjp", staffId: "sm1", date: "2026-08-01", start: "10:00", end: "21:00", note: "주말 피크" },
    { id: "shA6", storeId: "smjp", staffId: "sm1", date: "2026-08-02", start: "10:00", end: "20:00" },
    { id: "shB1", storeId: "smjp", staffId: "sm2", date: "2026-07-27", start: "09:00", end: "21:00" },
    { id: "shB2", storeId: "smjp", staffId: "sm2", date: "2026-07-29", start: "09:00", end: "21:00" },
    { id: "shB3", storeId: "smjp", staffId: "sm2", date: "2026-07-30", start: "09:00", end: "21:00" },
    { id: "shB4", storeId: "smjp", staffId: "sm2", date: "2026-07-31", start: "09:00", end: "21:00" },
    { id: "shB5", storeId: "smjp", staffId: "sm2", date: "2026-08-01", start: "09:00", end: "21:00" },
    { id: "shC1", storeId: "smjp", staffId: "sm3", date: "2026-07-27", start: "10:30", end: "21:00" },
    { id: "shC2", storeId: "smjp", staffId: "sm3", date: "2026-07-28", start: "10:30", end: "21:00" },
    { id: "shC3", storeId: "smjp", staffId: "sm3", date: "2026-07-30", start: "10:30", end: "21:00" },
    { id: "shC4", storeId: "smjp", staffId: "sm3", date: "2026-07-31", start: "10:30", end: "21:00" },
    { id: "shC5", storeId: "smjp", staffId: "sm3", date: "2026-08-01", start: "10:30", end: "21:00" },
    { id: "shD1", storeId: "smjp", staffId: "sm4", date: "2026-07-31", start: "11:00", end: "15:00", note: "점심 피크" },
    { id: "shD2", storeId: "smjp", staffId: "sm4", date: "2026-08-01", start: "11:00", end: "15:00", note: "점심 피크" },
    { id: "shE1", storeId: "dwmc", staffId: "dw1", date: "2026-07-28", start: "11:00", end: "22:00" },
    { id: "shE2", storeId: "dwmc", staffId: "dw1", date: "2026-07-29", start: "11:00", end: "22:00" },
    { id: "shE3", storeId: "dwmc", staffId: "dw1", date: "2026-07-30", start: "11:00", end: "22:00" },
    { id: "shE4", storeId: "dwmc", staffId: "dw1", date: "2026-07-31", start: "11:00", end: "22:00" },
    { id: "shE5", storeId: "dwmc", staffId: "dw1", date: "2026-08-01", start: "11:00", end: "22:00", note: "주말 피크" },
    { id: "shE6", storeId: "dwmc", staffId: "dw1", date: "2026-08-02", start: "11:00", end: "22:00" },
    { id: "shF1", storeId: "dwmc", staffId: "dw2", date: "2026-07-27", start: "11:00", end: "22:00" },
    { id: "shF2", storeId: "dwmc", staffId: "dw2", date: "2026-07-29", start: "11:00", end: "22:00" },
    { id: "shF3", storeId: "dwmc", staffId: "dw2", date: "2026-07-30", start: "11:00", end: "22:00" },
    { id: "shF4", storeId: "dwmc", staffId: "dw2", date: "2026-07-31", start: "11:00", end: "22:00" },
    { id: "shF5", storeId: "dwmc", staffId: "dw2", date: "2026-08-01", start: "11:00", end: "22:00" },
    { id: "shF6", storeId: "dwmc", staffId: "dw2", date: "2026-08-02", start: "11:00", end: "22:00" },
    { id: "shG1", storeId: "dwmc", staffId: "dw4", date: "2026-07-27", start: "16:00", end: "22:00" },
    { id: "shG2", storeId: "dwmc", staffId: "dw4", date: "2026-07-28", start: "16:00", end: "22:00" },
    { id: "shG3", storeId: "dwmc", staffId: "dw4", date: "2026-07-30", start: "16:00", end: "22:00" },
    { id: "shG4", storeId: "dwmc", staffId: "dw4", date: "2026-07-31", start: "16:00", end: "22:00" },
    { id: "shG5", storeId: "dwmc", staffId: "dw4", date: "2026-08-01", start: "16:00", end: "22:00" },
    { id: "shH1", storeId: "dwmc", staffId: "dw5", date: "2026-07-31", start: "17:00", end: "22:00", note: "저녁 피크" },
    { id: "shH2", storeId: "dwmc", staffId: "dw5", date: "2026-08-01", start: "17:00", end: "22:00", note: "저녁 피크" },
    { id: "shH3", storeId: "dwmc", staffId: "dw5", date: "2026-08-02", start: "17:00", end: "22:00" },
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

  // ── P&L (월별) ──────────────────────────────────
  pnl: [
    { id: "p1", storeId: "smjp", month: "2026-05", revenue: 56_000_000, foodCost: 19_000_000, labor: 14_500_000, rent: 7_000_000, utilities: 3_200_000, marketing: 1_400_000, other: 2_400_000 },
    { id: "p2", storeId: "smjp", month: "2026-06", revenue: 58_500_000, foodCost: 19_600_000, labor: 14_800_000, rent: 7_000_000, utilities: 3_300_000, marketing: 1_500_000, other: 2_400_000 },
    { id: "p3", storeId: "smjp", month: "2026-07", revenue: 60_200_000, foodCost: 20_500_000, labor: 15_100_000, rent: 7_000_000, utilities: 3_600_000, marketing: 1_600_000, other: 2_500_000 },
    { id: "p4", storeId: "dwmc", month: "2026-05", revenue: 128_000_000, foodCost: 55_000_000, labor: 26_000_000, rent: 14_000_000, utilities: 6_800_000, marketing: 6_000_000, other: 5_400_000 },
    { id: "p5", storeId: "dwmc", month: "2026-06", revenue: 132_500_000, foodCost: 56_800_000, labor: 26_500_000, rent: 14_000_000, utilities: 7_000_000, marketing: 6_200_000, other: 5_500_000 },
    { id: "p6", storeId: "dwmc", month: "2026-07", revenue: 137_400_000, foodCost: 59_000_000, labor: 27_000_000, rent: 14_000_000, utilities: 7_400_000, marketing: 6_400_000, other: 5_600_000 },
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
