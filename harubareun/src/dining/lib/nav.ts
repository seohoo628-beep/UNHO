export interface NavItem {
  path: string; // basePath 뒤에 붙는 경로 (대시보드는 "")
  label: string;
  icon: string;
  group: string;
}

// href 는 basePath(/dining · /sinmi · /daeun)와 조합해서 만든다.
export const NAV: NavItem[] = [
  { path: "", label: "대시보드", icon: "📊", group: "개요" },
  { path: "/guide", label: "사용 설명서", icon: "📖", group: "개요" },
  { path: "/operations", label: "운영기획", icon: "🎯", group: "운영" },
  { path: "/staff", label: "직원관리", icon: "👥", group: "운영" },
  { path: "/reservations", label: "예약관리", icon: "📅", group: "운영" },
  { path: "/ingredients", label: "식자재관리", icon: "📦", group: "운영" },
  { path: "/vendors", label: "거래처관리", icon: "🤝", group: "운영" },
  { path: "/sales", label: "매출·지출 입력", icon: "📈", group: "성장" },
  { path: "/marketing", label: "마케팅관리", icon: "📣", group: "성장" },
  { path: "/channels", label: "채널 바로가기", icon: "🔗", group: "성장" },
  { path: "/pnl", label: "P&L 관리", icon: "💰", group: "성장" },
  { path: "/fixed-costs", label: "고정비 관리", icon: "🏦", group: "성장" },
  { path: "/contracts", label: "근로계약서", icon: "📄", group: "운영" },
  { path: "/announcements", label: "전달사항", icon: "📌", group: "소통" },
  { path: "/meetings", label: "미팅·회의 일지", icon: "📝", group: "소통" },
  { path: "/assets", label: "자료실", icon: "📁", group: "소통" },
];

// basePath + item.path → 전체 href
export function navHref(basePath: string, item: NavItem): string {
  return basePath + item.path;
}
