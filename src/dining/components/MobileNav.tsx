"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@dining/lib/nav";
import { useData, inScope } from "@dining/lib/store";

// 모바일 전용 햄버거 메뉴 + 드로어. 데스크톱에서는 CSS로 숨김.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const { data, scope } = useData();

  const counts: Record<string, number> = {
    "/dining/operations": inScope(data.tasks, scope).filter((t) => t.status !== "done").length,
    "/dining/reservations": inScope(data.reservations, scope).filter((r) => r.status === "pending" || r.status === "confirmed").length,
    "/dining/ingredients": inScope(data.ingredients, scope).filter((i) => i.stock < i.parLevel).length,
    "/dining/announcements": inScope(data.announcements, scope).filter((a) => a.pinned).length,
  };
  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <>
      <button className="fnb-burger" aria-label="메뉴 열기" onClick={() => setOpen(true)}>
        ☰
      </button>
      {open && (
        <div className="fnb-drawer-backdrop" onClick={() => setOpen(false)}>
          <nav className="fnb-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="fnb-drawer-head">
              <div className="brand" style={{ padding: 0 }}>
                <div className="logo">運</div>
                <div>
                  <div className="title">운호 다이닝</div>
                  <div className="sub">신미집 · 대운목장</div>
                </div>
              </div>
              <button className="btn ghost sm" onClick={() => setOpen(false)} aria-label="닫기">
                ✕
              </button>
            </div>
            {groups.map((g) => (
              <div key={g}>
                <div className="nav-group-label">{g}</div>
                {NAV.filter((n) => n.group === g).map((n) => {
                  const active = n.href === "/dining" ? path === "/dining" : path.startsWith(n.href);
                  const cnt = counts[n.href];
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={`nav-item ${active ? "active" : ""}`}
                      onClick={() => setOpen(false)}
                    >
                      <span className="ico">{n.icon}</span>
                      <span>{n.label}</span>
                      {cnt ? <span className="badge-count">{cnt}</span> : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
