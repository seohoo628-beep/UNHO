"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// 홈 상단 뽀모도로 미니 위젯. 25분 집중 카운트다운 + 매크로놈(똑딱).
// 전체 기능은 /focus. 소리는 Web Audio로 직접 생성(외부 파일 불필요).
const FOCUS = 25 * 60;

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function PomodoroMini() {
  const [remaining, setRemaining] = useState(FOCUS);
  const [running, setRunning] = useState(false);
  const [metroOn, setMetroOn] = useState(true);
  const acRef = useRef<AudioContext | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const sec = useRef<ReturnType<typeof setInterval> | null>(null);

  const click = useCallback((freq: number, vol: number) => {
    const ctx = acRef.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }, []);

  const chime = useCallback(() => {
    const ctx = acRef.current;
    if (!ctx) return;
    [660, 880, 1100].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }, []);

  // 매크로놈 루프(1초 간격, 4박 강박).
  useEffect(() => {
    if (tick.current) clearInterval(tick.current);
    if (!running || !metroOn) return;
    let beat = 0;
    click(1000, 0.2);
    beat = 1;
    tick.current = setInterval(() => {
      const strong = beat % 4 === 0;
      click(strong ? 1000 : 800, strong ? 0.22 : 0.14);
      beat += 1;
    }, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running, metroOn, click]);

  // 카운트다운.
  useEffect(() => {
    if (sec.current) clearInterval(sec.current);
    if (!running) return;
    sec.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          chime();
          setRunning(false);
          return FOCUS;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (sec.current) clearInterval(sec.current);
    };
  }, [running, chime]);

  const start = () => {
    if (typeof window !== "undefined" && !acRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) acRef.current = new Ctx();
    }
    if (acRef.current?.state === "suspended") acRef.current.resume();
    setRunning(true);
  };

  const pct = Math.round(((FOCUS - remaining) / FOCUS) * 100);

  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        marginBottom: 14,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>⏱ 집중</span>
      <span style={{ fontSize: 26, fontWeight: 800, color: "#ea580c", fontVariantNumeric: "tabular-nums", minWidth: 84 }}>
        {mmss(remaining)}
      </span>
      <div style={{ flex: 1, minWidth: 60, height: 6, borderRadius: 999, background: "var(--line, #e4e7eb)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#ea580c", transition: "width .3s" }} />
      </div>
      {!running ? (
        <button className="btn sm primary" onClick={start}>▶ 시작</button>
      ) : (
        <button className="btn sm" onClick={() => setRunning(false)}>⏸</button>
      )}
      <button
        className="btn sm"
        onClick={() => setMetroOn((v) => !v)}
        title="매크로놈 소리"
        style={{ opacity: metroOn ? 1 : 0.5 }}
      >
        {metroOn ? "🔊" : "🔇"}
      </button>
      <button className="btn sm" onClick={() => { setRunning(false); setRemaining(FOCUS); }} title="리셋">↺</button>
      <Link href="/focus" className="btn sm" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>전체 →</Link>
    </div>
  );
}
