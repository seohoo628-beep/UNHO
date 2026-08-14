// 폴더(메뉴) 카탈로그 — 사이드바 Nav와 홈 런처가 함께 쓴다.
// 숨김 폴더(리포트/브랜드/업무보드/셀러시트/집행센터)는 여기 넣지 않는다(주소로는 접근 가능).

export type FolderItem = { href: string; label: string; badge?: boolean; owner?: boolean; ceo?: boolean; guest?: boolean; desc?: string };
export type FolderGroup = { title: string; items: FolderItem[] };

export const FOLDER_GROUPS: FolderGroup[] = [
  {
    title: "일일 업무",
    items: [
      { href: "/hub", label: "🏠 홈" },
      { href: "/morning-brief", label: "🌅 CEO 아침 브리핑", ceo: true },
      { href: "/reminders", label: "🔒 리마인드", ceo: true },
      { href: "/ideas", label: "🔒 아이디어 관리", ceo: true },
      { href: "/tiktok-leads", label: "🔒 틱톡 에이전트", ceo: true },
      { href: "/todos", label: "📋 업무투두 전직원" },
      { href: "/e-approval", label: "📑 전자결재" },
      { href: "/mall-links", label: "🛍 자사몰·광고채널 관리" },
      { href: "/assets", label: "🗂 각종 자료", guest: true },
      { href: "/meetings", label: "📝 미팅·회의 일지" },
      { href: "/manager-log", label: "📓 경영지원매니저 업무일지" },
      { href: "/designer-log", label: "🎨 디자이너 업무일지" },
      { href: "/marketer-log", label: "🖊 마케터 업무일지" },
      { href: "/bm-log", label: "🧭 BM 업무일지" },
      { href: "/md-log", label: "🛒 MD 업무일지" },
      { href: "/calendar", label: "📅 캘린더" },
      { href: "/drive", label: "📁 업무 시트들 (구글)" },
      { href: "/email", label: "📧 이메일 트래킹" },
      { href: "/guide", label: "📖 플랫폼 사용법" },
      { href: "/search", label: "🔎 통합 검색" },
    ],
  },
  {
    title: "인사·근태",
    items: [
      { href: "/leave", label: "🌴 연차관리" },
      { href: "/staff-directory", label: "🔒 직원관리" },
      { href: "/assignees", label: "🏷 담당자 관리" },
      { href: "/audit", label: "🕓 변경 이력", owner: true },
    ],
  },
  {
    title: "재무·정산",
    items: [
      { href: "/pnl", label: "🔒 P&L 현황(손익)" },
      { href: "/vendors", label: "📦 거래처·재고·발주 관리" },
      { href: "/accounts", label: "🔑 계정 ID·PW" },
    ],
  },
  {
    title: "상품·개발",
    items: [
      { href: "/inventory", label: "📦 재고관리" },
      { href: "/product-dev", label: "🧪 제품개발" },
    ],
  },
  {
    title: "콘텐츠·마케팅",
    items: [
      { href: "/approvals", label: "✅ 자동기획 콘텐츠 승인", badge: true },
      { href: "/promotions", label: "🎉 이벤트·프로모션" },
      { href: "/revenue-plans", label: "📈 매출증대방안" },
      { href: "/dashboard", label: "🗂 콘텐츠 결과물" },
      { href: "/planning", label: "🧩 MD·디자이너 자동기획" },
      { href: "/library", label: "🎬 제품 실제컷 삽입" },
    ],
  },
  {
    title: "파트너 협업",
    items: [{ href: "/partner", label: "🤝 파트너 협업", guest: true }],
  },
  {
    title: "영업·채널",
    items: [
      { href: "/groupbuy", label: "🛒 공구 트래킹" },
      { href: "/crm", label: "🤝 셀러·바이어 CRM" },
    ],
  },
  {
    title: "설정",
    items: [
      { href: "/settings", label: "⚙️ 설정", owner: true },
      { href: "/export", label: "💾 데이터 백업", owner: true },
    ],
  },
];
