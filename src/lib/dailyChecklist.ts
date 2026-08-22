// 홈 '오늘의 체크리스트' 고정 항목 정의(서버·클라이언트 공용, "use client" 아님).
export type DailyItem = { key: string; label: string; href?: string };
export type DailyGroup = { group: string; items: DailyItem[] };

export const CHECKLIST: DailyGroup[] = [
  {
    group: "운영",
    items: [
      { key: "todos_update", label: "업무투두 최신화", href: "/todos" },
      { key: "daily_sheets", label: "일일확인시트별 점검", href: "/drive" },
      { key: "vendor_kakao", label: "거래처별 단체톡 팔로업" },
      { key: "manager_log", label: "경영지원 업무일지 작성", href: "/work-logs" },
    ],
  },
  {
    group: "콘텐츠·마케팅",
    items: [
      { key: "content_plan", label: "콘텐츠 기획·발행", href: "/promotions" },
      { key: "review_reply", label: "리뷰 답글 (채널별)" },
      { key: "qna_check", label: "Q&A·문의 체크" },
      { key: "detail_page", label: "채널별 상세페이지 점검" },
    ],
  },
  {
    group: "SEO 최적화",
    items: [
      { key: "seo_title", label: "제목·키워드 점검" },
      { key: "seo_meta", label: "메타·설명문 점검" },
      { key: "seo_img", label: "이미지 alt·파일명" },
      { key: "seo_keyword", label: "상세페이지 키워드 반영" },
      { key: "seo_link", label: "내부링크·연관상품 연결" },
    ],
  },
  {
    group: "매장(F&B)",
    items: [
      { key: "fnb_check", label: "F&B 매장 체크(위생·재고·예약)" },
      { key: "dining_check", label: "신미집·대운목장 체크" },
    ],
  },
  {
    group: "재무·CS",
    items: [
      { key: "cash_check", label: "입출금·미수/미지급 확인", href: "/receivables" },
      { key: "cs_check", label: "CS·클레임 처리 확인" },
    ],
  },
];

export const ALL_KEYS = CHECKLIST.flatMap((g) => g.items.map((i) => i.key));

// 대표(CEO) 계정 전용 체크리스트 — 홈에서 직원용 대신 표시된다.
// 키는 ceo_ 접두사로 분리해 직원 체크와 섞이지 않는다.
export const CEO_CHECKLIST: DailyGroup[] = [
  {
    group: "경영 점검",
    items: [
      { key: "ceo_todos", label: "CEO 투두 정리", href: "/ceo-todos" },
      { key: "ceo_reminders", label: "리마인드 점검", href: "/reminders" },
      { key: "ceo_approvals", label: "승인 대기 처리", href: "/approvals" },
      { key: "ceo_due", label: "마감 임박·지연 업무 확인", href: "/todos" },
    ],
  },
  {
    group: "재무",
    items: [
      { key: "ceo_cash", label: "입출금·미수/미지급 확인", href: "/receivables" },
      { key: "ceo_pnl", label: "매출·P&L 확인", href: "/pnl" },
    ],
  },
  {
    group: "팀·브랜드",
    items: [
      { key: "ceo_worklogs", label: "팀 업무일지 확인", href: "/work-logs" },
      { key: "ceo_brand", label: "브랜드 성과·콘텐츠 확인", href: "/dashboard" },
      { key: "ceo_meeting", label: "미팅 기록·팔로업", href: "/meetings" },
    ],
  },
  {
    group: "개인 관리",
    items: [
      { key: "ceo_antiaging", label: "안티에이징 루틴", href: "/antiaging" },
      { key: "ceo_exercise", label: "운동" },
    ],
  },
];
export const CEO_ALL_KEYS = CEO_CHECKLIST.flatMap((g) => g.items.map((i) => i.key));

// 계정에 맞는 기본 체크리스트/키 (대표는 CEO 전용).
export const checklistFor = (isCeo: boolean): DailyGroup[] => (isCeo ? CEO_CHECKLIST : CHECKLIST);
export const keysFor = (isCeo: boolean): string[] => (isCeo ? CEO_ALL_KEYS : ALL_KEYS);
export const labelByKeyOf = (groups: DailyGroup[]): Record<string, string> =>
  Object.fromEntries(groups.flatMap((g) => g.items.map((i) => [i.key, i.label] as const)));

// 홈에서 실데이터로 자동 채우는 스마트 항목 타입.
export type SmartItem = { key: string; label: string; href: string; count: number };

// 주간 리포트(최근 7일 완료 추이 + 자주 놓친 항목).
export type WeeklyDay = { date: string; label: string; done: number; pct: number };
export type MissedItem = { key: string; label: string; done: number };
export type WeeklyReport = { dayStats: WeeklyDay[]; missed: MissedItem[]; need: number; avgPct: number };
export type MonthlyReport = { dayStats: WeeklyDay[]; avgPct: number; perfectDays: number; need: number };

// key → 라벨(고정 항목).
export const LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  CHECKLIST.flatMap((g) => g.items.map((i) => [i.key, i.label] as const))
);

// 사용자 정의 항목(직접 추가/편집). weekdays: 반복 요일(0=일…6=토), 비어있으면 매일.
export type CustomDailyItem = {
  id: string;
  group: string;
  label: string;
  href?: string;
  note?: string;
  weekdays?: number[];
  assignee?: string;
};

// 사용자 정의 항목의 체크 키(daily_checks.item_key).
export const customKey = (id: string) => `custom:${id}`;

// 오늘 요일(dow, 0=일…6=토)에 표시할 항목인지.
export function showsOn(item: CustomDailyItem, dow: number): boolean {
  return !item.weekdays || item.weekdays.length === 0 || item.weekdays.includes(dow);
}

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 고정 항목 + 사용자 항목을 그룹 단위로 병합(오늘 요일 기준 필터). 관리 모드용 미필터 병합은 사용처에서 처리.
export type MergedItem = DailyItem & { note?: string; custom?: boolean; assignee?: string };
export function mergeForDay(custom: CustomDailyItem[], dow: number, base: DailyGroup[] = CHECKLIST): { group: string; items: MergedItem[] }[] {
  const groups: { group: string; items: MergedItem[] }[] = base.map((g) => ({ group: g.group, items: g.items.map((i) => ({ ...i })) }));
  const byName = new Map(groups.map((g) => [g.group, g]));
  for (const c of custom) {
    if (!showsOn(c, dow)) continue;
    const mi: MergedItem = { key: customKey(c.id), label: c.label, href: c.href || undefined, note: c.note || undefined, custom: true, assignee: c.assignee || undefined };
    const g = byName.get(c.group);
    if (g) g.items.push(mi);
    else { const ng = { group: c.group, items: [mi] }; groups.push(ng); byName.set(c.group, ng); }
  }
  return groups.filter((g) => g.items.length > 0);
}
