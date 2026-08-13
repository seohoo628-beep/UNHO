"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePomodoro, mmss, DURATION } from "./PomodoroProvider";

// 어느 폴더에서나 떠 있는 뽀모도로 미니 바.
// 홈(/hub)·전체화면(/focus)에는 각자 UI가 있으므로 숨긴다.
// 타이머가 진행 중이거나(멈춤 포함) 소음이 켜져 있을 때만 표시(평소엔 방해 안 됨).
export default function GlobalPomodoro() {
  const p = usePomodoro();
  const pathname = usePathname();

  const onOwnPage = pathname === "/hub" || pathname.startsWith("/focus");
  const active = p.running || p.remaining !== DURATION[p.mode] || p.noiseOn;
  if (onOwnPage || !active) return null;

  const accent = p.mode === "focus" ? "#ea580c" : "#0ea5e9";

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 999,
        background: "var(--surface, #fff)",
        border: "1px solid var(--line, #e4e7eb)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.16)",
      }}
    >
      <span style={{ fontSize: 13 }}>{p.mode === "focus" ? "⏱" : "☕"}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: accent, fontVariantNumeric: "tabular-nums", minWidth: 58, textAlign: "center" }}>
        {mmss(p.remaining)}
      </span>
      {!p.running ? (
        <button className="btn sm primary" onClick={p.start} title="시작" style={{ padding: "3px 9px" }}>▶</button>
      ) : (
        <button className="btn sm" onClick={p.pause} title="일시정지" style={{ padding: "3px 9px" }}>⏸</button>
      )}
      <button
        className="btn sm"
        onClick={() => p.setNoiseOn(!p.noiseOn)}
        title="갈색 소음"
        style={{ padding: "3px 8px", opacity: p.noiseOn ? 1 : 0.5 }}
      >
        🌊
      </button>
      <Link href="/focus" className="btn sm" title="전체 화면" style={{ textDecoration: "none", padding: "3px 8px" }}>⤢</Link>
    </div>
  );
}
