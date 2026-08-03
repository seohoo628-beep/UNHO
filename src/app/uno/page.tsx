"use client";

import { useState } from "react";
import { UnoProvider, useUno, type SyncStatus } from "./store";
import { todayYmd } from "./lib";
import Dashboard from "./Dashboard";
import Monthly from "./Monthly";
import DailyLog from "./DailyLog";
import Workout from "./Workout";
import Records from "./Records";
import Goals from "./Goals";
import CalendarTab from "./CalendarTab";
import SettingsTab from "./SettingsTab";

type Tab = "dashboard" | "monthly" | "log" | "workout" | "records" | "goals" | "calendar" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "📊 주간 대시보드" },
  { key: "calendar", label: "📅 캘린더" },
  { key: "monthly", label: "🗓 월간 대시보드" },
  { key: "log", label: "✍️ 오늘 기록" },
  { key: "workout", label: "🏋️‍♂️ 운동일지" },
  { key: "records", label: "📈 기록 내역" },
  { key: "goals", label: "🎯 목표·습관" },
  { key: "settings", label: "⚙️ 설정" },
];

export default function UnoPage() {
  return (
    <UnoProvider>
      <UnoShell />
    </UnoProvider>
  );
}

const SYNC_LABEL: Record<SyncStatus, { text: string; cls: string }> = {
  loading: { text: "동기화 중…", cls: "loading" },
  saving: { text: "저장 중…", cls: "saving" },
  saved: { text: "모든 기기 동기화됨", cls: "saved" },
  offline: { text: "오프라인(이 기기에만 저장)", cls: "offline" },
};

function SyncBadge() {
  const { sync, syncNow } = useUno();
  const s = SYNC_LABEL[sync];
  return (
    <button className={`uno-syncbadge ${s.cls}`} onClick={syncNow} title="지금 동기화">
      <span className="uno-syncdot" />
      {s.text}
    </button>
  );
}

function UnoShell() {
  const { ready } = useUno();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [date, setDate] = useState<string>(todayYmd());
  const [logFocus, setLogFocus] = useState<{ section?: string; n: number }>({ n: 0 });

  // 대시보드 카드 클릭 → 오늘 기록의 해당 섹션으로 이동·스크롤
  const goToLog = (section?: string) => {
    setDate(todayYmd());
    setLogFocus((f) => ({ section, n: f.n + 1 }));
    setTab("log");
  };

  return (
    <div className="uno">
      <div className="page-head">
        <div>
          <h1>🌱 UNO 자기 관리</h1>
          <p>수면·운동·독서·공부·업무를 매일 기록하고 한눈에 관리하세요.</p>
        </div>
        <SyncBadge />
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
          {tab === "dashboard" && <Dashboard goToLog={goToLog} goToWorkout={() => setTab("workout")} />}
          {tab === "monthly" && (
            <Monthly
              openDate={(d) => {
                setDate(d);
                setTab("log");
              }}
            />
          )}
          {tab === "log" && (
            <DailyLog date={date} setDate={setDate} onDone={() => setTab("dashboard")} focus={logFocus} />
          )}
          {tab === "workout" && <Workout />}
          {tab === "records" && <Records />}
          {tab === "goals" && <Goals />}
          {tab === "calendar" && <CalendarTab />}
          {tab === "settings" && <SettingsTab />}
        </div>
      )}
    </div>
  );
}
