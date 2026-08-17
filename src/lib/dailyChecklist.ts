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

// 홈에서 실데이터로 자동 채우는 스마트 항목 타입.
export type SmartItem = { key: string; label: string; href: string; count: number };
