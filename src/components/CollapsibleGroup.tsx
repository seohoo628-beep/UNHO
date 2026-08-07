"use client";

import { useEffect, useState } from "react";

// 그룹 헤더를 눌러 접었다/폈다. 상태는 storageKey로 기기에 기억한다.
export default function CollapsibleGroup({
  title,
  count,
  color,
  storageKey,
  children,
}: {
  title: string;
  count: number;
  color: string;
  storageKey: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "0") setOpen(false);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const toggle = () =>
    setOpen((o) => {
      const n = !o;
      try {
        localStorage.setItem(storageKey, n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12, borderLeft: `4px solid ${color}` }}>
      <button
        onClick={toggle}
        style={{
          width: "100%",
          textAlign: "left",
          border: "none",
          cursor: "pointer",
          padding: "9px 14px",
          background: `${color}14`,
          fontWeight: 600,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--ink)",
        }}
      >
        <span style={{ display: "inline-block", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none", fontSize: 12, color: "var(--ink-2)" }}>▸</span>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
        {title}
        <span className="muted" style={{ fontWeight: 400 }}>· {count}건</span>
      </button>
      <div style={{ display: open ? "block" : "none" }}>{children}</div>
    </div>
  );
}
