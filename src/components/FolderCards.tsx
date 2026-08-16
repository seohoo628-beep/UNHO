"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FolderGroup } from "@/lib/folders";

// 홈 폴더 런처 카드 + 빨간 알림 배지(사이드바와 동일: 지난 방문 이후 새 항목 수).
export default function FolderCards({
  groups,
  counts,
  pendingCount,
}: {
  groups: FolderGroup[];
  counts: Record<string, number>;
  pendingCount: number;
}) {
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [pins, setPins] = useState<string[]>([]);

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

  useEffect(() => {
    try { const raw = localStorage.getItem("folderpins"); if (raw) setPins(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);

  const togglePin = (href: string) => {
    setPins((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
      try { localStorage.setItem("folderpins", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // 전체 아이템(핀 섹션 구성용). 보이는 폴더만.
  const allItems = groups.flatMap((g) => g.items);
  const pinned = pins.map((h) => allItems.find((it) => it.href === h)).filter(Boolean) as typeof allItems;

  const Card = ({ it }: { it: (typeof allItems)[number] }) => {
    const badge = it.badge ? pendingCount : unread[it.href] ?? 0;
    const sp = it.label.indexOf(" ");
    const icon = sp > 0 ? it.label.slice(0, sp) : "";
    const text = sp > 0 ? it.label.slice(sp + 1) : it.label;
    const isPinned = pins.includes(it.href);
    return (
      <Link
        href={it.href}
        className="card folder-card"
        style={{ padding: "10px 5px", textDecoration: "none", color: "var(--ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 5, minHeight: 78, position: "relative" }}
      >
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(it.href); }}
          title={isPinned ? "즐겨찾기 해제" : "즐겨찾기"}
          style={{ position: "absolute", top: 3, left: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 12, lineHeight: 1, color: isPinned ? "#f59e0b" : "var(--line-2)", padding: 2 }}
        >{isPinned ? "★" : "☆"}</button>
        {icon && <span style={{ fontSize: 23, lineHeight: 1 }}>{icon}</span>}
        <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, wordBreak: "keep-all" }}>{text}</span>
        {badge > 0 && <span className="count" style={{ position: "absolute", top: 6, right: 6 }}>{badge}</span>}
      </Link>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {pinned.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>⭐ 즐겨찾기</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 8 }}>
            {pinned.map((it) => <Card key={"pin:" + it.href} it={it} />)}
          </div>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.title}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
            {g.title}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 8 }}>
            {g.items.map((it) => <Card key={it.href} it={it} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
