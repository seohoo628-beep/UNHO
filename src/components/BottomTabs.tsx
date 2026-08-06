"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; ico: string; badge?: "approvals" }[] = [
  { href: "/hub", label: "홈", ico: "🏠" },
  { href: "/approvals", label: "승인", ico: "✅", badge: "approvals" },
  { href: "/todos", label: "투두", ico: "📋" },
  { href: "/ceo-todos", label: "CEO", ico: "🔒" },
  { href: "/payables", label: "미지급", ico: "💳" },
  { href: "/email", label: "메일", ico: "📧" },
];

// 모바일 하단 고정 탭바. 자주 쓰는 5개.
export default function BottomTabs({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="빠른 이동">
      {TABS.map((t) => {
        const on = pathname === t.href || pathname.startsWith(t.href + "/");
        const badge = t.badge === "approvals" ? pendingCount : 0;
        return (
          <Link key={t.href} href={t.href} className={on ? "on" : ""}>
            <span className="ico">{t.ico}</span>
            <span>{t.label}</span>
            {badge > 0 && <span className="tabbadge">{badge > 99 ? "99+" : badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
