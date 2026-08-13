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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {groups.map((g) => (
        <div key={g.title}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
            {g.title}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
            {g.items.map((it) => {
              const badge = it.badge ? pendingCount : unread[it.href] ?? 0;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="card folder-card"
                  style={{
                    padding: "20px 18px",
                    textDecoration: "none",
                    color: "var(--ink)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: 15.5,
                    fontWeight: 600,
                    minHeight: 78,
                    position: "relative",
                  }}
                >
                  <span>{it.label}</span>
                  {badge > 0 && <span className="count">{badge}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
