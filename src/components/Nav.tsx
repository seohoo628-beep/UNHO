"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 메뉴 순서·이름·이모지는 대표 지정 기준. 숨김 처리된 폴더(리포트/브랜드/업무보드/셀러시트)는
// 페이지·데이터는 그대로 두고 메뉴에서만 제외한다(주소로는 접근 가능).
const ITEMS = [
  { href: "/todos", label: "📋 업무투두 전직원" },
  { href: "/drive", label: "📁 업무 시트들 (구글)" },
  { href: "/ceo-todos", label: "🔒 CEO 투두" },
  { href: "/manager-log", label: "📓 경영지원매니저 업무일지" },
  { href: "/leave", label: "🌴 연차관리" },
  { href: "/staff-directory", label: "🔒 직원관리" },
  { href: "/pnl", label: "💰 P&L 현황(손익)" },
  { href: "/vendors", label: "📦 거래처·재고·발주 관리" },
  { href: "/approvals", label: "✅ 자동기획 콘텐츠 승인", badge: true },
  { href: "/execute", label: "🚀 콘텐츠 집행 센터" },
  { href: "/ai", label: "🤖 AI 직원" },
  { href: "/accounts", label: "🔑 계정 ID·PW" },
  { href: "/assets", label: "🖼 제품 이미지·영상 자료" },
  { href: "/groupbuy", label: "🛒 공구 트래킹" },
  { href: "/crm", label: "🤝 셀러·바이어 CRM" },
  { href: "/dining", label: "🥩 신미집·대운목장 관리" },
  { href: "/fnb", label: "🍗 청담 오리골·은우 더블랙 관리" },
  { href: "/dashboard", label: "📊 콘텐츠 대시보드" },
  { href: "/library", label: "🎬 제품 실제컷 삽입" },
];

export default function Nav({
  pendingCount,
  isOwner,
}: {
  pendingCount: number;
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const items = isOwner ? [...ITEMS, { href: "/settings", label: "⚙️ 설정" }] : ITEMS;
  return (
    <nav>
      {items.map((it) => {
        const active = pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`navlink${active ? " active" : ""}`}
          >
            <span>{it.label}</span>
            {it.badge && pendingCount > 0 && (
              <span className="count">{pendingCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
