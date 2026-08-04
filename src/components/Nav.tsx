"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 메뉴는 카테고리별로 묶어 표시한다. 숨김 폴더(리포트/브랜드/업무보드/셀러시트)는
// 페이지·데이터는 그대로 두고 메뉴에서만 제외한다(주소로는 접근 가능).
type Item = { href: string; label: string; badge?: boolean };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "일일 업무",
    items: [
      { href: "/hub", label: "🏠 운영 현황" },
      { href: "/guide", label: "📖 플랫폼 사용법" },
      { href: "/todos", label: "📋 업무투두 전직원" },
      { href: "/drive", label: "📁 업무 시트들 (구글)" },
      { href: "/email", label: "📧 이메일 트래킹" },
      { href: "/ceo-todos", label: "🔒 CEO 투두" },
      { href: "/manager-log", label: "📓 경영지원매니저 업무일지" },
      { href: "/meetings", label: "📝 미팅·회의 일지" },
    ],
  },
  {
    title: "인사·근태",
    items: [
      { href: "/leave", label: "🌴 연차관리" },
      { href: "/staff-directory", label: "🔒 직원관리" },
    ],
  },
  {
    title: "재무·정산",
    items: [
      { href: "/pnl", label: "🔒 P&L 현황(손익)" },
      { href: "/vendors", label: "📦 거래처·재고·발주 관리" },
      { href: "/receivables", label: "🔒 미수금 (받을 돈)" },
      { href: "/payables", label: "🔒 미지급금 (줄 돈)" },
      { href: "/accounts", label: "🔑 계정 ID·PW" },
    ],
  },
  {
    title: "콘텐츠·마케팅",
    items: [
      { href: "/approvals", label: "✅ 자동기획 콘텐츠 승인", badge: true },
      { href: "/planning", label: "🧩 MD·디자이너 자동기획" },
      { href: "/execute", label: "🚀 콘텐츠 집행 센터" },
      { href: "/ai", label: "🤖 AI 직원" },
      { href: "/assets", label: "🖼 제품 이미지·영상 자료" },
      { href: "/dashboard", label: "📊 콘텐츠 대시보드" },
      { href: "/library", label: "🎬 제품 실제컷 삽입" },
    ],
  },
  {
    title: "영업·채널",
    items: [
      { href: "/mall-links", label: "🛍 자사몰 바로가기" },
      { href: "/groupbuy", label: "🛒 공구 트래킹" },
      { href: "/crm", label: "🤝 셀러·바이어 CRM" },
    ],
  },
  {
    title: "매장 운영",
    items: [
      { href: "/dining", label: "🔒 신미집·대운목장 관리" },
      { href: "/fnb", label: "🔒 청담 오리골·은우 더블랙 관리" },
    ],
  },
];

const groupTitleStyle: React.CSSProperties = {
  padding: "6px 11px 3px",
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.06em",
  color: "#8a929b",
  textTransform: "uppercase",
};

export default function Nav({
  pendingCount,
  isOwner,
}: {
  pendingCount: number;
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const groups: Group[] = isOwner
    ? [...GROUPS, { title: "설정", items: [{ href: "/settings", label: "⚙️ 설정" }] }]
    : GROUPS;

  return (
    <nav>
      {groups.map((g) => (
        <div key={g.title} style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
          <div style={groupTitleStyle}>{g.title}</div>
          {g.items.map((it) => {
            const active = pathname.startsWith(it.href);
            return (
              <Link key={it.href} href={it.href} className={`navlink${active ? " active" : ""}`}>
                <span>{it.label}</span>
                {it.badge && pendingCount > 0 && <span className="count">{pendingCount}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
