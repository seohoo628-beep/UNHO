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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {g.items.map((it) => {
              const badge = it.badge ? pendingCount : unread[it.href] ?? 0;
              const sp = it.label.indexOf(" ");
              const icon = sp > 0 ? it.label.slice(0, sp) : "";
              const text = sp > 0 ? it.label.slice(sp + 1) : it.label;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="card folder-card"
                  style={{
                    padding: "14px 8px",
                    textDecoration: "none",
                    color: "var(--ink)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    gap: 7,
                    minHeight: 92,
                    position: "relative",
                  }}
                >
                  {icon && <span style={{ fontSize: 24, lineHeight: 1 }}>{icon}</span>}
                  <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.28, wordBreak: "keep-all" }}>{text}</span>
                  {badge > 0 && (
                    <span className="count" style={{ position: "absolute", top: 6, right: 6 }}>{badge}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
