"use client";

import { useData } from "@dining/lib/store";
import { STORES, STORE_MAP } from "@dining/lib/stores";
import { MobileNav } from "./MobileNav";
import type { StoreId } from "@dining/lib/types";

export function Topbar() {
  const { scope, setScope, locked, reset } = useData();

  // '전 매장' 폐지 — 매장별 개별 관리.
  const opts: { id: StoreId; label: string }[] = STORES.map((s) => ({ id: s.id, label: s.name }));
  const lockedStore = locked ? STORE_MAP[locked] : null;

  return (
    <header className="topbar">
      <MobileNav />
      {lockedStore ? (
        // 단일 매장 전용 앱 — 스위처 대신 매장명만 표시.
        <div className="store-switch">
          <button className="active" style={{ cursor: "default" }}>
            {lockedStore.emoji} {lockedStore.name}
          </button>
        </div>
      ) : (
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
      )}
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
