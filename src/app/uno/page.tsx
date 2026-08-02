"use client";

import { useEffect, useState } from "react";
import { UnoProvider, useUno } from "./store";
import { todayYmd } from "./lib";
import Dashboard from "./Dashboard";
import DailyLog from "./DailyLog";
import Records from "./Records";
import Goals from "./Goals";
import CalendarTab from "./CalendarTab";
import SettingsTab from "./SettingsTab";

const PIN = "010100";
const UNLOCK_KEY = "uno-unlock-v1";

type Tab = "dashboard" | "log" | "records" | "goals" | "calendar" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "📊 대시보드" },
  { key: "log", label: "✍️ 오늘 기록" },
  { key: "records", label: "📈 기록 내역" },
  { key: "goals", label: "🎯 목표·습관" },
  { key: "calendar", label: "📅 캘린더" },
  { key: "settings", label: "⚙️ 설정" },
];

export default function UnoPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(UNLOCK_KEY) === "1") setUnlocked(true);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  return (
    <UnoProvider>
      <UnoShell />
    </UnoProvider>
  );
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === PIN) {
      try {
        sessionStorage.setItem(UNLOCK_KEY, "1");
      } catch {
        /* ignore */
      }
      onUnlock();
    } else {
      setErr(true);
      setPin("");
    }
  };

  return (
    <div className="uno-gate">
      <form onSubmit={submit} className="card uno-gate-card">
        <div className="uno-gate-emoji">🌱</div>
        <h2>UNO 자기 관리</h2>
        <p className="muted">PIN 번호를 입력하세요</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setErr(false);
          }}
          placeholder="● ● ● ● ● ●"
          className={`uno-gate-input${err ? " err" : ""}`}
        />
        {err && <div className="uno-gate-err">PIN이 올바르지 않습니다.</div>}
        <button type="submit" className="btn primary uno-gate-btn">
          잠금 해제
        </button>
      </form>
    </div>
  );
}

function UnoShell() {
  const { ready } = useUno();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [date, setDate] = useState<string>(todayYmd());

  return (
    <div className="uno">
      <div className="page-head">
        <div>
          <h1>🌱 UNO 자기 관리</h1>
          <p>수면·운동·독서·공부·업무를 매일 기록하고 한눈에 관리하세요.</p>
        </div>
      </div>

      <nav className="uno-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`uno-tab${tab === t.key ? " on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {!ready ? (
        <div className="card uno-loading">불러오는 중…</div>
      ) : (
        <div className="uno-panel">
          {tab === "dashboard" && (
            <Dashboard
              goToLog={() => {
                setDate(todayYmd());
                setTab("log");
              }}
            />
          )}
          {tab === "log" && <DailyLog date={date} setDate={setDate} />}
          {tab === "records" && <Records />}
          {tab === "goals" && <Goals />}
          {tab === "calendar" && <CalendarTab />}
          {tab === "settings" && <SettingsTab />}
        </div>
      )}
    </div>
  );
}
