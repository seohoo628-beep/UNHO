"use client";

import { usePomodoro, mmss, DURATION, type Mode } from "@/components/pomodoro/PomodoroProvider";

// 뽀모도로 집중 전체 화면. 타이머 로직은 전역 PomodoroProvider가 보유(폴더 이동에도 유지).
export default function PomodoroClient() {
  const p = usePomodoro();
  const total = DURATION[p.mode];
  const pct = Math.round(((total - p.remaining) / total) * 100);
  const accent = p.mode === "focus" ? "#ea580c" : "#0ea5e9";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>뽀모도로 집중</h1>
          <p>25분 집중 · 5분 휴식. 매크로놈·갈색소음으로 리듬을 유지하세요. 폴더를 이동해도 계속 작동합니다.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn${p.mode === "focus" ? " primary" : ""}`} onClick={() => p.switchMode("focus" as Mode)}>집중 25분</button>
        <button className={`btn${p.mode === "break" ? " primary" : ""}`} onClick={() => p.switchMode("break" as Mode)}>휴식 5분</button>
      </div>

      <div className="card" style={{ padding: 28, textAlign: "center", maxWidth: 460 }}>
        <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: "0.02em", color: accent, fontVariantNumeric: "tabular-nums" }}>
          {mmss(p.remaining)}
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "var(--line, #e4e7eb)", overflow: "hidden", margin: "14px 0 6px" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: accent, transition: "width .3s" }} />
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {p.mode === "focus" ? "집중" : "휴식"} · 오늘 완료 {p.rounds}회
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18 }}>
          {!p.running ? (
            <button className="btn primary" style={{ minWidth: 100 }} onClick={p.start}>▶ 시작</button>
          ) : (
            <button className="btn" style={{ minWidth: 100 }} onClick={p.pause}>⏸ 일시정지</button>
          )}
          <button className="btn" onClick={p.reset}>↺ 리셋</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 14, maxWidth: 460 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
          <input type="checkbox" checked={p.metroOn} onChange={(e) => p.setMetroOn(e.target.checked)} />
          매크로놈 소리 (똑딱)
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, opacity: p.metroOn ? 1 : 0.5 }}>
          <span className="muted" style={{ fontSize: 13, minWidth: 64 }}>빠르기</span>
          <input
            type="range"
            min={40}
            max={160}
            step={5}
            value={p.bpm}
            disabled={!p.metroOn}
            onChange={(e) => p.setBpm(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 56, textAlign: "right" }}>{p.bpm} BPM</span>
        </div>

        <div style={{ borderTop: "1px solid var(--line, #e4e7eb)", margin: "14px 0" }} />

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
          <input type="checkbox" checked={p.noiseOn} onChange={(e) => p.setNoiseOn(e.target.checked)} />
          🌊 갈색 소음 (폭포·굵은 빗소리)
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, opacity: p.noiseOn ? 1 : 0.5 }}>
          <span className="muted" style={{ fontSize: 13, minWidth: 64 }}>볼륨</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(p.noiseVol * 100)}
            disabled={!p.noiseOn}
            onChange={(e) => p.setNoiseVol(Number(e.target.value) / 100)}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 40, textAlign: "right" }}>{Math.round(p.noiseVol * 100)}</span>
        </div>

        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          휴대폰은 무음/진동 모드에서는 소리가 나지 않을 수 있습니다. 처음 &ldquo;시작&rdquo; 또는 소리 켜기를 눌러야 오디오가 활성화됩니다.
        </p>
      </div>
    </div>
  );
}
