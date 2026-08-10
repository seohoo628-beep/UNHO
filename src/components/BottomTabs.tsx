"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; ico: string; badge?: "approvals"; owner?: boolean; ceo?: boolean }[] = [
  { href: "/hub", label: "홈", ico: "🏠" },
  { href: "/meetings", label: "미팅", ico: "📝" },
  { href: "/todos", label: "투두", ico: "📋" },
  { href: "/ceo-todos", label: "CEO", ico: "🔒", ceo: true },
  { href: "/payables", label: "미지급", ico: "💳" },
  { href: "/morning-brief", label: "브리핑", ico: "🌅", ceo: true },
];

// 게스트(파트너) 전용 탭.
const GUEST_TABS = [
  { href: "/partner", label: "협업", ico: "🤝" },
  { href: "/assets", label: "자료", ico: "🖼" },
] as { href: string; label: string; ico: string; badge?: "approvals"; owner?: boolean; ceo?: boolean }[];

// 모바일 하단 고정 탭바. CEO 탭은 최운호 본인 계정만, 게스트는 협업·자료만.
export default function BottomTabs({ pendingCount, isOwner, isCeo = false, isGuest = false }: { pendingCount: number; isOwner: boolean; isCeo?: boolean; isGuest?: boolean }) {
  const pathname = usePathname();
  const tabs = isGuest ? GUEST_TABS : TABS.filter((t) => (!t.owner || isOwner) && (!t.ceo || isCeo));
  return (
    <nav className="tabbar" aria-label="빠른 이동" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      {tabs.map((t) => {
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
