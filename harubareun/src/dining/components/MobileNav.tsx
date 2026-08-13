"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, navHref } from "@dining/lib/nav";
import { useData, inScope } from "@dining/lib/store";
import { STORE_MAP } from "@dining/lib/stores";

// 모바일 전용 햄버거 메뉴 + 드로어. 데스크톱에서는 CSS로 숨김.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const { data, scope, locked, basePath } = useData();
  const lockedStore = locked ? STORE_MAP[locked] : null;

  const counts: Record<string, number> = {
    "/operations": inScope(data.tasks, scope).filter((t) => t.status !== "done").length,
    "/reservations": inScope(data.reservations, scope).filter((r) => r.status === "pending" || r.status === "confirmed").length,
    "/ingredients": inScope(data.ingredients, scope).filter((i) => i.stock < i.parLevel).length,
    "/announcements": inScope(data.announcements, scope).filter((a) => a.pinned).length,
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
                <div className="logo">{lockedStore ? lockedStore.emoji : "運"}</div>
                <div>
                  <div className="title">{lockedStore ? lockedStore.name : "다이닝"}</div>
                  <div className="sub">{lockedStore ? lockedStore.concept : "신미집 · 대운목장"}</div>
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
                  const href = navHref(basePath, n);
                  const active = n.path === "" ? path === basePath : path.startsWith(href);
                  const cnt = counts[n.path];
                  return (
                    <Link
                      key={href}
                      href={href}
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
