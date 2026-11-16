// 폴더(메뉴) 카탈로그 — 사이드바 Nav와 홈 런처가 함께 쓴다.
// 숨김 폴더(리포트/브랜드/업무보드/셀러시트/집행센터)는 여기 넣지 않는다(주소로는 접근 가능).

export type FolderItem = { href: string; label: string; badge?: boolean; owner?: boolean; ceo?: boolean; guest?: boolean; finance?: boolean; desc?: string; newTab?: boolean };
export type FolderGroup = { title: string; items: FolderItem[] };

/** 기본으로 접혀 있는 보관함 묶음 제목 */
export const ARCHIVE_GROUP = "🗄 보관함";

export const FOLDER_GROUPS: FolderGroup[] = [
  // 2026-11 단순화: 9개 묶음·46개 메뉴 → 핵심 6개 묶음. 자주 안 쓰는 메뉴는 맨 아래 '보관함'으로
  // (주소·데이터는 그대로, 필요하면 보관함에서 열거나 위 묶음으로 옮기면 된다).
  {
    title: "오늘 업무",
    items: [
      { href: "/hub", label: "🏠 홈" },
      { href: "/situation", label: "🧭 대표 상황판", ceo: true, desc: "매출·현금·재고·결재·AI 보고 한 화면" },
      { href: "/morning-brief", label: "🌅 CEO 아침 브리핑", ceo: true },
      { href: "/ceo-todos", label: "🔒 CEO 투두", ceo: true },
      { href: "/reminders", label: "🔒 리마인드", ceo: true },
      { href: "/todos", label: "📋 업무투두" },
      { href: "/meetings", label: "📝 미팅·회의 일지" },
      { href: "/work-logs", label: "📓 업무일지" },
      { href: "/e-approval", label: "📑 전자결재" },
      { href: "/calendar", label: "📅 캘린더" },
      { href: "/search", label: "🔎 통합 검색" },
    ],
  },
  {
    title: "AI 직원",
    items: [
      { href: "/agent-routines", label: "🤖 AI 직원 업무·검토" },
      { href: "/data-import", label: "📥 데이터 입력 (CS·출고·공구)", desc: "엑셀·CSV 붙여넣기 → AI 직원이 매일 읽음" },
    ],
  },
  {
    title: "돈·재고",
    items: [
      { href: "/pnl", label: "🔒 손익 (P&L)", desc: "브랜드별·통합 P&L" },
      { href: "/receivables", label: "🔒 미수금 (받을 돈)", finance: true },
      { href: "/payables", label: "🔒 미지급금 (줄 돈)", finance: true },
      { href: "/invoices", label: "🧾 세금계산서 발행·관리", finance: true, desc: "미발행·기한·팝빌 즉시 발행" },
      { href: "/statements", label: "📄 거래명세서", finance: true, desc: "작성·인쇄·전자 발급" },
      { href: "/contracts", label: "📑 계약서 관리", finance: true, desc: "기간·만료 알림·계약서 파일" },
      { href: "/vendors", label: "🤝 거래처·발주" },
      { href: "/inventory", label: "📦 재고관리" },
    ],
  },
  {
    title: "영업·상품",
    items: [
      { href: "/crm", label: "🤝 셀러·바이어 CRM" },
      { href: "/groupbuy", label: "🛒 공구 트래킹" },
      { href: "/mudangtea", label: "🔒 무당티 유통 관리", finance: true, desc: "판매처 제안·판매·재고·유통기한·배송비" },
      { href: "/thai-content", label: "🇹🇭 태국 숏폼 채널", desc: "틱톡·숏츠·릴스 매일 기획안·촬영 구도" },
      { href: "/promotions", label: "🎉 이벤트·프로모션" },
      { href: "/product-dev", label: "🧪 제품개발" },
      { href: "/mall-links", label: "🛍 자사몰·광고채널" },
      { href: "/sinmi", label: "🍚 신미집 관리", newTab: true },
      { href: "/daeun", label: "🐄 대운목장 관리", newTab: true },
    ],
  },
  {
    title: "사람·자료",
    items: [
      { href: "/leave", label: "🌴 연차관리" },
      { href: "/staff-directory", label: "🔒 직원관리" },
      { href: "/contacts", label: "🔒 인적자산", ceo: true },
      { href: "/business-cards", label: "🔒 명함목록", ceo: true },
      { href: "/assets", label: "🗂 각종 자료", guest: true },
      { href: "/partner", label: "🤝 파트너 협업", guest: true },
      { href: "/drive", label: "📁 업무 시트 (구글)" },
      { href: "/accounts", label: "🔑 계정 ID·PW" },
      { href: "/guide", label: "📖 플랫폼 사용법" },
    ],
  },
  {
    title: "설정",
    items: [
      { href: "/settings", label: "⚙️ 설정", owner: true },
      { href: "/assignees", label: "🏷 담당자 관리", owner: true },
      { href: "/audit", label: "🕓 변경 이력", owner: true },
      { href: "/export", label: "💾 데이터 백업", owner: true },
    ],
  },
  {
    // 사용 빈도가 낮거나 다른 메뉴와 겹치는 것. 기본으로 접혀 보인다.
    title: ARCHIVE_GROUP,
    items: [
      { href: "/ideas", label: "💡 아이디어 관리", ceo: true },
      { href: "/expense-plans", label: "💸 지출계획표·가계부", ceo: true },
      { href: "/food-places", label: "🍽 맛집 저장", ceo: true },
      { href: "/antiaging", label: "🧴 안티에이징 관리", ceo: true },
      { href: "/tiktok-leads", label: "🎵 틱톡 에이전트", ceo: true },
      { href: "/email", label: "📧 이메일 트래킹" },
      { href: "/focus", label: "⏱ 뽀모도로 집중" },
      { href: "/commerce-lectures", label: "🎓 커머스강의" },
      { href: "/commerce-framework", label: "📚 커머스 운영 프레임" },
      { href: "/commerce-interview", label: "🧾 커머스 마케팅 플랜", newTab: true },
      { href: "/revenue-plans", label: "📈 매출증대방안" },
      { href: "/dashboard", label: "🗂 콘텐츠 결과물" },
    ],
  },
];
