"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FOLDER_GROUPS, type FolderGroup } from "@/lib/folders";

// 메뉴는 카테고리별로 묶어 표시한다. 폴더 카탈로그는 @/lib/folders 공유(홈 런처와 동일).
type Group = FolderGroup;

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
  counts,
}: {
  pendingCount: number;
  isOwner: boolean;
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();
  // 폴더별 '지난 방문 이후 새로 추가된 항목 수'(빨간 숫자). 마지막으로 본 개수를 기기에 저장해 비교.
  const [unread, setUnread] = useState<Record<string, number>>({});
  // 카테고리(그룹) 접힘 상태.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("nav-collapsed-v1");
      if (raw) setCollapsedGroups(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleGroup = (title: string) =>
    setCollapsedGroups((prev) => {
      const n = { ...prev, [title]: !prev[title] };
      try {
        localStorage.setItem("nav-collapsed-v1", JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });

  useEffect(() => {
    const c = counts ?? {};
    const u: Record<string, number> = {};
    for (const href of Object.keys(c)) {
      let seen = 0;
      try {
        seen = Number(localStorage.getItem(`navseen:${href}`) ?? "0");
      } catch {
        /* ignore */
      }
      const delta = c[href] - (Number.isFinite(seen) ? seen : 0);
      if (delta > 0) u[href] = delta;
    }
    setUnread(u);
  }, [counts]);

  // 현재 열람 중인 폴더는 '봤음'으로 기록하고 배지 제거.
  useEffect(() => {
    const c = counts ?? {};
    const href = Object.keys(c).find((h) => pathname === h || pathname.startsWith(h + "/"));
    if (!href) return;
    try {
      localStorage.setItem(`navseen:${href}`, String(c[href]));
    } catch {
      /* ignore */
    }
    setUnread((prev) => {
      if (!(href in prev)) return prev;
      const n = { ...prev };
      delete n[href];
      return n;
    });
  }, [pathname, counts]);

  // 설정 등 owner 전용 항목은 아래 렌더 필터(!it.owner || isOwner)에서 걸러진다.
  const groups: Group[] = FOLDER_GROUPS;

  return (
    <nav>
      {groups.map((g) => {
        const visible = g.items.filter((it) => !it.owner || isOwner);
        if (visible.length === 0) return null;
        // 현재 페이지가 속한 그룹은 접혀 있어도 펼쳐 보여준다.
        const hasActive = visible.some((it) => pathname.startsWith(it.href));
        const open = !collapsedGroups[g.title] || hasActive;
        // 접혔을 때 놓친 배지 합계.
        const hiddenBadge = visible.reduce((s, it) => s + (it.badge ? pendingCount : unread[it.href] ?? 0), 0);
        return (
          <div key={g.title} style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
            <button
              onClick={() => toggleGroup(g.title)}
              style={{ ...groupTitleStyle, display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}
            >
              <span style={{ display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none", fontSize: 9 }}>▸</span>
              <span style={{ flex: 1 }}>{g.title}</span>
              {!open && hiddenBadge > 0 && <span className="count">{hiddenBadge}</span>}
            </button>
            {open &&
              visible.map((it) => {
                const active = pathname.startsWith(it.href);
                const badgeNum = it.badge ? pendingCount : unread[it.href] ?? 0;
                return (
                  <Link key={it.href} href={it.href} className={`navlink${active ? " active" : ""}`}>
                    <span>{it.label}</span>
                    {badgeNum > 0 && <span className="count">{badgeNum}</span>}
                  </Link>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}
