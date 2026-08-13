"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { makeBrownNoise, type BrownNoise } from "@/lib/brownNoise";

// 뽀모도로 전역 상태. 앱 레이아웃에 마운트되어 폴더 이동에도 유지된다(타이머·소리 지속).
export type Mode = "focus" | "break";
export const DURATION: Record<Mode, number> = { focus: 25 * 60, break: 5 * 60 };

export function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type PomodoroCtx = {
  mode: Mode;
  remaining: number;
  running: boolean;
  metroOn: boolean;
  bpm: number;
  noiseOn: boolean;
  noiseVol: number;
  rounds: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  switchMode: (m: Mode) => void;
  setMetroOn: (v: boolean) => void;
  setBpm: (n: number) => void;
  setNoiseOn: (v: boolean) => void;
  setNoiseVol: (n: number) => void;
};

const Ctx = createContext<PomodoroCtx | null>(null);

export function usePomodoro(): PomodoroCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePomodoro must be used within PomodoroProvider");
  return v;
}

export function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(DURATION.focus);
  const [running, setRunning] = useState(false);
  const [metroOn, setMetroOn] = useState(true);
  const [bpm, setBpm] = useState(60);
  const [noiseOn, setNoiseOn] = useState(false);
  const [noiseVol, setNoiseVol] = useState(0.4);
  const [rounds, setRounds] = useState(0);

  const acRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<BrownNoise | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const secTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const ac = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!acRef.current) {
      const C = window.AudioContext || (window as any).webkitAudioContext;
      if (!C) return null;
      acRef.current = new C();
    }
    if (acRef.current.state === "suspended") acRef.current.resume();
    return acRef.current;
  }, []);

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

  // 매크로놈 루프
  useEffect(() => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (!running || !metroOn) return;
    let beat = 0;
    const interval = Math.max(150, Math.round(60000 / bpm));
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

  // 카운트다운
  useEffect(() => {
    if (secTimer.current) clearInterval(secTimer.current);
    if (!running) return;
    secTimer.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          chime();
          const next: Mode = mode === "focus" ? "break" : "focus";
          if (mode === "focus") setRounds((n) => n + 1);
          setMode(next);
          // 자동 연속: 세션이 끝나면 멈추지 않고 다음 세션(휴식→집중)을 바로 이어서 시작.
          setRunning(true);
          return DURATION[next];
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (secTimer.current) clearInterval(secTimer.current);
    };
  }, [running, mode, chime]);

  // 갈색 소음
  useEffect(() => {
    const ctx = ac();
    if (!ctx) return;
    if (!noiseRef.current) noiseRef.current = makeBrownNoise(ctx);
    if (noiseOn) noiseRef.current.start(noiseVol);
    else noiseRef.current.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseOn, ac]);

  useEffect(() => {
    noiseRef.current?.setVolume(noiseVol);
  }, [noiseVol]);

  const start = useCallback(() => {
    ac();
    setRunning(true);
  }, [ac]);
  const pause = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => {
    setRunning(false);
    setRemaining(DURATION[mode]);
  }, [mode]);
  const switchMode = useCallback((m: Mode) => {
    setRunning(false);
    setMode(m);
    setRemaining(DURATION[m]);
  }, []);
  const setNoise = useCallback((v: boolean) => {
    ac();
    setNoiseOn(v);
  }, [ac]);

  return (
    <Ctx.Provider
      value={{
        mode,
        remaining,
        running,
        metroOn,
        bpm,
        noiseOn,
        noiseVol,
        rounds,
        start,
        pause,
        reset,
        switchMode,
        setMetroOn,
        setBpm,
        setNoiseOn: setNoise,
        setNoiseVol,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
