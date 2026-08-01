"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { useData, inScope } from "@/lib/store";

export function Sidebar() {
  const path = usePathname();
  const { data, scope } = useData();

  // 사이드바 카운트 배지
  const counts: Record<string, number> = {
    "/operations": inScope(data.tasks, scope).filter((t) => t.status !== "done").length,
    "/reservations": inScope(data.reservations, scope).filter(
      (r) => r.status === "pending" || r.status === "confirmed"
    ).length,
    "/ingredients": inScope(data.ingredients, scope).filter((i) => i.stock < i.parLevel).length,
    "/announcements": inScope(data.announcements, scope).filter((a) => a.pinned).length,
  };

  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">運</div>
        <div>
          <div className="title">운호 F&amp;B</div>
          <div className="sub">매장 통합관리</div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g}>
          <div className="nav-group-label">{g}</div>
          {NAV.filter((n) => n.group === g).map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            const cnt = counts[n.href];
            return (
              <Link key={n.href} href={n.href} className={`nav-item ${active ? "active" : ""}`}>
                <span className="ico">{n.icon}</span>
                <span>{n.label}</span>
                {cnt ? <span className="badge-count">{cnt}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="spacer" />
      <div style={{ padding: "12px 10px", fontSize: 11, color: "var(--text-3)" }}>
        운호컴퍼니 · 2026
        <br />
        데이터는 브라우저에 저장됩니다
      </div>
    </aside>
  );
}
