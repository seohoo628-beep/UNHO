"use client";

import { useData } from "@dining/lib/store";
import { STORES } from "@dining/lib/stores";
import { MobileNav } from "./MobileNav";
import type { StoreId } from "@dining/lib/types";

export function Topbar() {
  const { scope, setScope, reset } = useData();

  const opts: { id: StoreId | "all"; label: string }[] = [
    { id: "all", label: "전 매장" },
    ...STORES.map((s) => ({ id: s.id, label: s.name })),
  ];

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
