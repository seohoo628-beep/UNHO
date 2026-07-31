"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/approvals", label: "승인 큐", badge: true },
  { href: "/execute", label: "집행 센터" },
  { href: "/todos", label: "업무 투두" },
  { href: "/tasks", label: "업무 보드" },
  { href: "/ai", label: "AI 직원" },
  { href: "/crm", label: "셀러·바이어 CRM" },
  { href: "/sellers", label: "셀러 시트" },
  { href: "/library", label: "제품컷" },
  { href: "/vendors", label: "거래처·발주" },
  { href: "/pnl", label: "P&L" },
  { href: "/reports", label: "리포트" },
  { href: "/brands", label: "브랜드" },
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
