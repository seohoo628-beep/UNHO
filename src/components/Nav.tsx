"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/approvals", label: "승인 큐", badge: true },
  { href: "/tasks", label: "업무 보드" },
  { href: "/ai", label: "AI 직원" },
  { href: "/brands", label: "브랜드" },
];

export default function Nav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  return (
    <nav>
      {ITEMS.map((it) => {
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
