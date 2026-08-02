export interface NavItem {
  href: string;
  label: string;
  icon: string;
  group: string;
}

export const NAV: NavItem[] = [
  { href: "/dining", label: "대시보드", icon: "📊", group: "개요" },
  { href: "/dining/guide", label: "사용 설명서", icon: "📖", group: "개요" },
  { href: "/dining/operations", label: "운영기획", icon: "🎯", group: "운영" },
  { href: "/dining/staff", label: "직원관리", icon: "👥", group: "운영" },
  { href: "/dining/reservations", label: "예약관리", icon: "📅", group: "운영" },
  { href: "/dining/ingredients", label: "식자재관리", icon: "📦", group: "운영" },
  { href: "/dining/vendors", label: "거래처관리", icon: "🤝", group: "운영" },
  { href: "/dining/sales", label: "매출·지출 입력", icon: "📈", group: "성장" },
  { href: "/dining/marketing", label: "마케팅관리", icon: "📣", group: "성장" },
  { href: "/dining/pnl", label: "P&L 관리", icon: "💰", group: "성장" },
  { href: "/dining/fixed-costs", label: "고정비 관리", icon: "🏦", group: "성장" },
  { href: "/dining/contracts", label: "근로계약서", icon: "📄", group: "운영" },
  { href: "/dining/announcements", label: "전달사항", icon: "📌", group: "소통" },
  { href: "/dining/meetings", label: "미팅·회의 일지", icon: "📝", group: "소통" },
  { href: "/dining/assets", label: "자료실", icon: "📁", group: "소통" },
];
