"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FOLDER_GROUPS } from "@/lib/folders";

const TABS: { href: string; label: string; ico: string; badge?: "approvals"; owner?: boolean; ceo?: boolean; notCeo?: boolean; finance?: boolean }[] = [
  { href: "/hub", label: "홈", ico: "🏠" },
  { href: "/meetings", label: "미팅", ico: "📝" },
  { href: "/business-cards", label: "명함", ico: "📇", ceo: true },
  { href: "/ceo-todos", label: "CEO", ico: "🔒", ceo: true },
  { href: "/contacts", label: "인적자산", ico: "👥", ceo: true },
  { href: "/todos", label: "투두", ico: "📋", notCeo: true },
  { href: "/reminders", label: "리마인드", ico: "🔔", ceo: true },
  { href: "/payables", label: "미지급", ico: "💳", notCeo: true, finance: true },
  // 브리핑은 '더보기' 전체 메뉴(🌅 CEO 아침 브리핑)로 접근 — 하단탭에서는 제외.
];

// 게스트(파트너) 전용 탭.
const GUEST_TABS = [
  { href: "/partner", label: "협업", ico: "🤝" },
  { href: "/assets", label: "자료", ico: "🖼" },
] as { href: string; label: string; ico: string; badge?: "approvals"; owner?: boolean; ceo?: boolean; notCeo?: boolean }[];

// 모바일 하단 고정 탭바. CEO 탭은 최운호 본인 계정만, 게스트는 협업·자료만.
// '더보기'로 전체 폴더 시트를 열어 모든 메뉴(브리핑 포함)에 접근한다.
export default function BottomTabs({ pendingCount, isOwner, isCeo = false, isFinance = false, isGuest = false }: { pendingCount: number; isOwner: boolean; isCeo?: boolean; isFinance?: boolean; isGuest?: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = isGuest ? GUEST_TABS : TABS.filter((t) => (!t.owner || isOwner) && (!t.ceo || isCeo) && (!t.notCeo || !isCeo) && (!t.finance || isFinance));

  // 시트에 노출할 전체 폴더(역할 필터는 홈과 동일 규칙).
  const groups = isGuest
    ? []
    : FOLDER_GROUPS.map((g) => ({
        title: g.title,
        items: g.items.filter((it) => (!it.owner || isOwner) && (!it.ceo || isCeo) && (!it.finance || isFinance)),
      })).filter((g) => g.items.length > 0);

  const cols = tabs.length + (isGuest ? 0 : 1);

  return (
    <>
      <nav className="tabbar" aria-label="빠른 이동" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {tabs.map((t) => {
          const on = pathname === t.href || pathname.startsWith(t.href + "/");
          const badge = t.badge === "approvals" ? pendingCount : 0;
          return (
            <Link key={t.href} href={t.href} className={on ? "on" : ""} onClick={() => setMoreOpen(false)}>
              <span className="ico">{t.ico}</span>
              <span>{t.label}</span>
              {badge > 0 && <span className="tabbadge">{badge > 99 ? "99+" : badge}</span>}
            </Link>
          );
        })}
        {!isGuest && (
          <button type="button" className={moreOpen ? "on" : ""} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} aria-label="더보기">
            <span className="ico">☰</span>
            <span>더보기</span>
          </button>
        )}
      </nav>

      {moreOpen && !isGuest && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1900, display: "flex", alignItems: "flex-end" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: "100%", maxHeight: "78vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: "16px 16px 88px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>전체 메뉴</div>
              <button className="btn sm" onClick={() => setMoreOpen(false)}>닫기</button>
            </div>
            {groups.map((g) => (
              <div key={g.title} style={{ marginBottom: 14 }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{g.title}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {g.items.map((it) => {
                    const on = pathname === it.href || pathname.startsWith(it.href + "/");
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        target={it.newTab ? "_blank" : undefined}
                        rel={it.newTab ? "noreferrer" : undefined}
                        onClick={() => setMoreOpen(false)}
                        className="card"
                        style={{ padding: "11px 12px", fontSize: 13.5, fontWeight: 600, textDecoration: "none", border: on ? "1.5px solid var(--accent, #6366f1)" : undefined }}
                      >
                        {it.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
