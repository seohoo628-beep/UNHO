"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, navHref } from "@dining/lib/nav";
import { useData, inScope } from "@dining/lib/store";
import { STORE_MAP } from "@dining/lib/stores";

export function Sidebar() {
  const path = usePathname();
  const { data, scope, locked, basePath } = useData();
  const lockedStore = locked ? STORE_MAP[locked] : null;

  // 사이드바 카운트 배지 (경로 접미사 기준)
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
        <div className="logo">{lockedStore ? lockedStore.emoji : "運"}</div>
        <div>
          <div className="title">{lockedStore ? lockedStore.name : "다이닝"}</div>
          <div className="sub">{lockedStore ? lockedStore.concept : "신미집 · 대운목장"}</div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g}>
          <div className="nav-group-label">{g}</div>
          {NAV.filter((n) => n.group === g).map((n) => {
            const href = navHref(basePath, n);
            const active = n.path === "" ? path === basePath : path.startsWith(href);
            const cnt = counts[n.path];
            return (
              <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`}>
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
        하루바른·나아 · 2026
        <br />
        데이터는 브라우저에 저장됩니다
      </div>
    </aside>
  );
}
