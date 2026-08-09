"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 뽀모도로 집중 타이머. 집중 25분 / 휴식 5분.
// 매크로놈(똑딱 소리)은 Web Audio API로 직접 생성 → 외부 파일·네트워크 불필요.
type Mode = "focus" | "break";
const DURATION: Record<Mode, number> = { focus: 25 * 60, break: 5 * 60 };

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function PomodoroClient() {
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(DURATION.focus);
  const [running, setRunning] = useState(false);
  const [metroOn, setMetroOn] = useState(true);
  const [bpm, setBpm] = useState(60);
  const [rounds, setRounds] = useState(0);

  const acRef = useRef<AudioContext | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const secTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 오디오 컨텍스트 확보(사용자 제스처 후 생성/재개).
  const ac = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!acRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      acRef.current = new Ctx();
    }
    return acRef.current;
  }, []);

  // 짧은 클릭음(매크로놈). freq: 강박 1000 / 약박 800.
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

  // 완료 알림음(3음 상승 차임).
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

  // 매크로놈 루프: running + metroOn 일 때만.
  useEffect(() => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (!running || !metroOn) return;
    let beat = 0;
    const interval = Math.max(150, Math.round(60000 / bpm));
    // 첫 박 즉시.
    click(1000, 0.2);
    beat = 1;
    tickTimer.current = setInterval(() => {
      const strong = beat % 4 === 0;
      click(strong ? 1000 : 800, strong ? 0.22 : 0.14);
      beat += 1;
    }, interval);
    return () => {
      if (tickTimer.current) clearInterval(tickTimer.current);
    };
  }, [running, metroOn, bpm, click]);

  // 카운트다운.
  useEffect(() => {
    if (secTimer.current) clearInterval(secTimer.current);
    if (!running) return;
    secTimer.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          // 세션 종료.
          chime();
          const next: Mode = mode === "focus" ? "break" : "focus";
          if (mode === "focus") setRounds((n) => n + 1);
          setMode(next);
          setRunning(false);
          return DURATION[next];
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (secTimer.current) clearInterval(secTimer.current);
    };
  }, [running, mode, chime]);

  const start = () => {
    const ctx = ac();
    if (ctx && ctx.state === "suspended") ctx.resume();
    setRunning(true);
  };
  const pause = () => setRunning(false);
  const reset = () => {
    setRunning(false);
    setRemaining(DURATION[mode]);
  };
  const switchMode = (m: Mode) => {
    setRunning(false);
    setMode(m);
    setRemaining(DURATION[m]);
  };

  const total = DURATION[mode];
  const pct = Math.round(((total - remaining) / total) * 100);
  const accent = mode === "focus" ? "#ea580c" : "#0ea5e9";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>뽀모도로 집중</h1>
          <p>25분 집중 · 5분 휴식. 매크로놈 소리로 리듬을 유지하세요.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn${mode === "focus" ? " primary" : ""}`} onClick={() => switchMode("focus")}>집중 25분</button>
        <button className={`btn${mode === "break" ? " primary" : ""}`} onClick={() => switchMode("break")}>휴식 5분</button>
      </div>

      <div className="card" style={{ padding: 28, textAlign: "center", maxWidth: 460 }}>
        <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: "0.02em", color: accent, fontVariantNumeric: "tabular-nums" }}>
          {mmss(remaining)}
        </div>
        {/* 진행 바 */}
        <div style={{ height: 8, borderRadius: 999, background: "var(--line, #e4e7eb)", overflow: "hidden", margin: "14px 0 6px" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: accent, transition: "width .3s" }} />
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {mode === "focus" ? "집중" : "휴식"} · 오늘 완료 {rounds}회
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18 }}>
          {!running ? (
            <button className="btn primary" style={{ minWidth: 100 }} onClick={start}>▶ 시작</button>
          ) : (
            <button className="btn" style={{ minWidth: 100 }} onClick={pause}>⏸ 일시정지</button>
          )}
          <button className="btn" onClick={reset}>↺ 리셋</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 14, maxWidth: 460 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
          <input type="checkbox" checked={metroOn} onChange={(e) => setMetroOn(e.target.checked)} />
          매크로놈 소리 (똑딱)
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, opacity: metroOn ? 1 : 0.5 }}>
          <span className="muted" style={{ fontSize: 13, minWidth: 64 }}>빠르기</span>
          <input
            type="range"
            min={40}
            max={160}
            step={5}
            value={bpm}
            disabled={!metroOn}
            onChange={(e) => setBpm(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 56, textAlign: "right" }}>{bpm} BPM</span>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          휴대폰은 무음/진동 모드에서는 소리가 나지 않을 수 있습니다. 처음 &ldquo;시작&rdquo;을 눌러야 소리가 켜집니다.
        </p>
      </div>
    </div>
  );
}
