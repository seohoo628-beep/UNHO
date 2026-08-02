"use client";

import { useData } from "@fnb/lib/store";
import { STORES } from "@fnb/lib/stores";
import { MobileNav } from "./MobileNav";
import type { StoreId } from "@fnb/lib/types";

export function Topbar() {
  const { scope, setScope, reset } = useData();

  // '전 매장' 폐지 — 매장별 개별 관리.
  const opts: { id: StoreId; label: string }[] = STORES.map((s) => ({ id: s.id, label: s.name }));

  return (
    <header className="topbar">
      <MobileNav />
      <div className="store-switch">
        {opts.map((o) => (
          <button
            key={o.id}
            className={scope === o.id ? "active" : ""}
            onClick={() => setScope(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="spacer" />
      <span className="badge gray fnb-topdate">🗓 2026-08-01</span>
      <button
        className="btn ghost sm"
        title="시드 데이터로 초기화"
        onClick={() => {
          if (confirm("모든 변경사항을 지우고 예시 데이터로 초기화할까요?")) reset();
        }}
      >
        ↺ 초기화
      </button>
    </header>
  );
}
