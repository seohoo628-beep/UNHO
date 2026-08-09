"use client";

import Link from "next/link";
import { usePomodoro, mmss, DURATION } from "@/components/pomodoro/PomodoroProvider";

// 홈 상단 뽀모도로 미니 위젯. 전역 상태(PomodoroProvider)를 공유 → 폴더 이동에도 유지.
export default function PomodoroMini() {
  const p = usePomodoro();
  const total = DURATION[p.mode];
  const pct = Math.round(((total - p.remaining) / total) * 100);
  const accent = p.mode === "focus" ? "#ea580c" : "#0ea5e9";

  return (
    <div
      className="card"
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", marginBottom: 14, flexWrap: "wrap" }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
        {p.mode === "focus" ? "⏱ 집중" : "☕ 휴식"}
      </span>
      <span style={{ fontSize: 26, fontWeight: 800, color: accent, fontVariantNumeric: "tabular-nums", minWidth: 84 }}>
        {mmss(p.remaining)}
      </span>
      <div style={{ flex: 1, minWidth: 60, height: 6, borderRadius: 999, background: "var(--line, #e4e7eb)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: accent, transition: "width .3s" }} />
      </div>
      {!p.running ? (
        <button className="btn sm primary" onClick={p.start}>▶ 시작</button>
      ) : (
        <button className="btn sm" onClick={p.pause}>⏸</button>
      )}
      <button className="btn sm" onClick={() => p.setMetroOn(!p.metroOn)} title="매크로놈 소리" style={{ opacity: p.metroOn ? 1 : 0.5 }}>
        {p.metroOn ? "🔊" : "🔇"}
      </button>
      <button className="btn sm" onClick={() => p.setNoiseOn(!p.noiseOn)} title="갈색 소음(폭포·굵은 빗소리)" style={{ opacity: p.noiseOn ? 1 : 0.5 }}>
        🌊
      </button>
      <button className="btn sm" onClick={p.reset} title="리셋">↺</button>
      <Link href="/focus" className="btn sm" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>전체 →</Link>
    </div>
  );
}
