"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import LogoutButton from "@/components/LogoutButton";

export default function AppSidebar({
  pendingCount,
  isOwner,
  userLabel,
}: {
  pendingCount: number;
  isOwner: boolean;
  userLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 페이지 이동 시 모바일 드로어 닫기.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 드로어 열렸을 때 배경 스크롤 잠금.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* 모바일 상단 바 */}
      <header className="topbar">
        <button
          className="hamburger"
          aria-label="메뉴 열기"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="topbar-brand">운호컴퍼니</div>
      </header>

      {open && <div className="backdrop" onClick={() => setOpen(false)} />}

      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="brand">
          운호컴퍼니
          <small>운영 플랫폼 · Phase 1</small>
        </div>
        <Nav pendingCount={pendingCount} isOwner={isOwner} />
        <div className="foot">
          {userLabel}
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
