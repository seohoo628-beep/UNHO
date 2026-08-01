// ─────────────────────────────────────────────────────────────
// 운호컴퍼니 F&B 매장관리 플랫폼 — 도메인 타입
// ─────────────────────────────────────────────────────────────

export type StoreId = "chdo" | "euwb"; // 청담 오리닭 / 은우 더 블랙

export interface Store {
  id: StoreId;
  name: string;
  concept: string;
  address: string;
  phone: string;
  openHours: string;
  seats: number;
  managerName: string;
  color: string; // 브랜드 액센트
  emoji: string;
}

// ── 운영기획 ──────────────────────────────────────────────
export type Priority = "high" | "mid" | "low";
export type TaskStatus = "todo" | "doing" | "done";

export interface OpsGoal {
  id: string;
  storeId: StoreId;
  period: string; // 예: 2026-08
  title: string;
  metric: string; // 지표
  target: number;
  actual: number;
  unit: string; // 원 / % / 건 ...
}

export interface OpsTask {
  id: string;
  storeId: StoreId;
  title: string;
  owner: string;
  due: string; // YYYY-MM-DD
  priority: Priority;
  status: TaskStatus;
  category: string; // 매장운영 / 시설 / CS / 위생 ...
}

// ── 직원관리 ──────────────────────────────────────────────
export type EmployStatus = "active" | "leave" | "resigned";

export interface Staff {
  id: string;
  storeId: StoreId;
  name: string;
  role: string; // 점장 / 홀 / 주방 / 파트타임
  phone: string;
  employType: "정직원" | "파트타임" | "매니저";
  status: EmployStatus;
  hireDate: string; // YYYY-MM-DD
  wageType: "월급" | "시급";
  wage: number; // 월급(원) 또는 시급(원)
}

export interface ShiftEntry {
  id: string;
  storeId: StoreId;
  staffId: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm
  note?: string;
}

// ── 마케팅관리 ────────────────────────────────────────────
export type CampaignStatus = "planned" | "running" | "done";

export interface Campaign {
  id: string;
  storeId: StoreId;
  name: string;
  channel: string; // 인스타 / 네이버 / 배달앱 / 블로그 ...
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  budget: number; // 원
  spent: number; // 원
  reach: number; // 도달/노출
  conversions: number; // 예약/방문 전환
  owner: string;
}

// ── P&L ───────────────────────────────────────────────────
export interface PnlMonth {
  id: string;
  storeId: StoreId;
  month: string; // YYYY-MM
  revenue: number; // 매출
  foodCost: number; // 식자재 원가
  labor: number; // 인건비
  rent: number; // 임대료
  utilities: number; // 관리/공과금
  marketing: number; // 마케팅비
  other: number; // 기타
}

// ── 식자재관리 ────────────────────────────────────────────
export interface Ingredient {
  id: string;
  storeId: StoreId;
  name: string;
  category: string; // 육류 / 채소 / 주류 / 소스 / 소모품
  unit: string; // kg / ea / 병 ...
  stock: number; // 현재고
  parLevel: number; // 적정재고(발주점)
  unitPrice: number; // 단가(원)
  vendor: string; // 거래처
  lastIn: string; // 최근 입고일
}

export type PoStatus = "requested" | "ordered" | "received";

export interface PurchaseOrder {
  id: string;
  storeId: StoreId;
  vendor: string;
  itemName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  status: PoStatus;
  orderDate: string;
  eta: string; // 입고예정
}

// ── 예약관리 ──────────────────────────────────────────────
export type ReservationStatus = "confirmed" | "pending" | "seated" | "cancelled" | "noshow";

export interface Reservation {
  id: string;
  storeId: StoreId;
  name: string;
  phone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  partySize: number;
  status: ReservationStatus;
  channel: string; // 전화 / 네이버 / 캐치테이블 / 워크인
  memo?: string;
}

// ── 전달사항 ──────────────────────────────────────────────
export interface Announcement {
  id: string;
  storeId: StoreId | "all"; // 특정 매장 또는 전 매장
  title: string;
  body: string;
  author: string;
  priority: Priority;
  createdAt: string; // YYYY-MM-DD
  pinned: boolean;
}

// ── 매출·분석 ─────────────────────────────────────────────
export interface DailySales {
  id: string;
  storeId: StoreId;
  date: string; // YYYY-MM-DD
  lunch: number; // 런치 매출
  dinner: number; // 디너 매출
  covers: number; // 방문 객수(명)
  purchase: number; // 일 지출 - 식자재 매입
  misc: number; // 일 지출 - 기타 경비(잡비 등)
}

export interface MenuItem {
  id: string;
  storeId: StoreId;
  name: string;
  category: string; // 메인 / 사이드 / 주류 / 음료 / 코스
  price: number; // 판매가
  cost: number; // 원가
  soldQty: number; // 기간 판매수량(최근 30일 기준)
}

// ── 전체 데이터 형상 ──────────────────────────────────────
export interface AppData {
  goals: OpsGoal[];
  tasks: OpsTask[];
  staff: Staff[];
  shifts: ShiftEntry[];
  campaigns: Campaign[];
  pnl: PnlMonth[];
  ingredients: Ingredient[];
  purchaseOrders: PurchaseOrder[];
  reservations: Reservation[];
  announcements: Announcement[];
  dailySales: DailySales[];
  menus: MenuItem[];
}
