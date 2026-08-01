"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/todos", label: "업무 투두" },
  { href: "/drive", label: "업무 진행시트" },
  { href: "/ceo-todos", label: "🔒 CEO 투두" },
  { href: "/dashboard", label: "대시보드" },
  { href: "/approvals", label: "승인 큐", badge: true },
  { href: "/execute", label: "집행 센터" },
  { href: "/tasks", label: "업무 보드" },
  { href: "/ai", label: "AI 직원" },
  { href: "/crm", label: "셀러·바이어 CRM" },
  { href: "/groupbuy", label: "공구 트래킹" },
  { href: "/sellers", label: "셀러 시트" },
  { href: "/drive", label: "업무 진행시트" },
  { href: "/library", label: "제품컷" },
  { href: "/vendors", label: "거래처·발주" },
  { href: "/pnl", label: "P&L" },
  { href: "/reports", label: "리포트" },
  { href: "/brands", label: "브랜드" },
  { href: "/fnb", label: "🍽 F&B 매장관리" },
  { href: "/dining", label: "🥩 신미집·대운목장" },
];

export default function Nav({
  pendingCount,
  isOwner,
}: {
  pendingCount: number;
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const items = isOwner ? [...ITEMS, { href: "/settings", label: "설정" }] : ITEMS;
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
