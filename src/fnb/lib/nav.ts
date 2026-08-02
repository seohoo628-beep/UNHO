export interface NavItem {
  href: string;
  label: string;
  icon: string;
  group: string;
}

export const NAV: NavItem[] = [
  { href: "/fnb", label: "대시보드", icon: "📊", group: "개요" },
  { href: "/fnb/operations", label: "운영기획", icon: "🎯", group: "운영" },
  { href: "/fnb/staff", label: "직원관리", icon: "👥", group: "운영" },
  { href: "/fnb/reservations", label: "예약관리", icon: "📅", group: "운영" },
  { href: "/fnb/ingredients", label: "식자재관리", icon: "📦", group: "운영" },
  { href: "/fnb/vendors", label: "거래처관리", icon: "🤝", group: "운영" },
  { href: "/fnb/sales", label: "매출분석", icon: "📈", group: "성장" },
  { href: "/fnb/marketing", label: "마케팅관리", icon: "📣", group: "성장" },
  { href: "/fnb/pnl", label: "P&L 관리", icon: "💰", group: "성장" },
  { href: "/fnb/announcements", label: "전달사항", icon: "📌", group: "소통" },
  { href: "/fnb/meetings", label: "미팅·회의 일지", icon: "📝", group: "소통" },
  { href: "/fnb/assets", label: "자료실", icon: "📁", group: "소통" },
];
