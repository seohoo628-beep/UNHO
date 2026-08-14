"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import BottomTabs from "@/components/BottomTabs";
import Toaster from "@/components/Toaster";
import NotificationBell from "@/components/NotificationBell";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import StartupBriefing from "@/components/StartupBriefing";

export default function AppSidebar({
  pendingCount,
  isOwner,
  isCeo = false,
  isFinance = false,
  isGuest = false,
  userLabel,
  counts,
}: {
  pendingCount: number;
  isOwner: boolean;
  isCeo?: boolean;
  isFinance?: boolean;
  isGuest?: boolean;
  userLabel: string;
  counts?: Record<string, number>;
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
        <div style={{ marginLeft: "auto" }}>
          <NotificationBell />
        </div>
      </header>

      {open && <div className="backdrop" onClick={() => setOpen(false)} />}

      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="brand" style={{ textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/unho-logo.svg" alt="(주)운호컴퍼니 UNHO COMPANY" style={{ display: "block", width: "100%", maxWidth: 240, margin: "4px auto 6px" }} />
          <small>운영 플랫폼</small>
        </div>
        <Nav pendingCount={pendingCount} isOwner={isOwner} isCeo={isCeo} isFinance={isFinance} isGuest={isGuest} counts={counts} />
        <div className="foot">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{userLabel}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <NotificationBell />
              <ThemeToggle />
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <BottomTabs pendingCount={pendingCount} isOwner={isOwner} isCeo={isCeo} isFinance={isFinance} isGuest={isGuest} />
      <Toaster />
      <RealtimeRefresh />
      <StartupBriefing />
    </>
  );
}
