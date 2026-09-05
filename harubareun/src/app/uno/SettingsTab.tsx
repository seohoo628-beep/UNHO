"use client";

import { useRef, useState } from "react";
import { useUno } from "./store";
import { Field, NumInput } from "./ui";
import { DEFAULT_STATE, type UnoState } from "./types";

export default function SettingsTab() {
  const { state, setState, replaceAll } = useUno();
  const t = state.settings.targets || {};
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [resetArmed, setResetArmed] = useState(false);

  const patchTarget = (key: keyof NonNullable<UnoState["settings"]["targets"]>, v: number | undefined) =>
    setState((p) => ({ ...p, settings: { ...p.settings, targets: { ...p.settings.targets, [key]: v } } }));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uno-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        replaceAll(parsed);
        setMsg("불러오기 완료 ✅");
      } catch {
        setMsg("파일을 읽을 수 없습니다 ❌");
      }
      setTimeout(() => setMsg(""), 3000);
    };
    reader.readAsText(file);
  };

  const days = Object.keys(state.logs).length;

  return (
    <div className="uno-settings">
      <div className="card">
        <h3>👤 프로필</h3>
        <Field label="이름 / 닉네임">
          <input
            type="text"
            placeholder="대시보드 인사에 표시"
            value={state.settings.ownerName || ""}
            onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, ownerName: e.target.value } }))}
          />
        </Field>
      </div>

      <div className="card uno-mt">
        <h3>🎯 개인 목표치</h3>
        <div className="grid cols-2">
          <Field label="목표 수면 시간">
            <NumInput value={t.sleepHours} step={0.5} suffix="시간" onChange={(v) => patchTarget("sleepHours", v)} />
          </Field>
          <Field label="주간 운동 목표">
            <NumInput value={t.exerciseDaysPerWeek} suffix="일" onChange={(v) => patchTarget("exerciseDaysPerWeek", v)} />
          </Field>
          <Field label="일일 공부 목표">
            <NumInput value={t.studyMinutesPerDay} suffix="분" onChange={(v) => patchTarget("studyMinutesPerDay", v)} />
          </Field>
          <Field label="일일 독서 목표">
            <NumInput value={t.readingMinutesPerDay} suffix="분" onChange={(v) => patchTarget("readingMinutesPerDay", v)} />
          </Field>
          <Field label="하루 물 목표">
            <NumInput value={t.waterMl} step={100} suffix="ml" onChange={(v) => patchTarget("waterMl", v)} />
          </Field>
        </div>
      </div>

      <div className="card uno-mt">
        <h3>💾 백업 · 복원</h3>
        <p className="muted uno-hint">
          모든 기록은 서버에 저장되어 접속하는 모든 기기에서 자동 동기화됩니다({days}일치 기록). 추가 백업이
          필요하면 파일로 내보내세요. (서버 연결이 안 될 때는 이 기기에 임시 저장 후 자동 재동기화됩니다.)
        </p>
        <div className="uno-btn-row">
          <button className="btn" onClick={exportJson}>
            📤 내보내기 (JSON)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            📥 불러오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = "";
            }}
          />
          {msg && <span className="badge accent">{msg}</span>}
        </div>
      </div>

      <div className="card uno-mt uno-danger">
        <h3>⚠️ 초기화</h3>
        <p className="muted uno-hint">모든 기록·목표·서재·일정을 삭제하고 기본값으로 되돌립니다. 되돌릴 수 없습니다.</p>
        <button
          className="btn"
          onClick={() => {
            // 전체 초기화는 되돌릴 수 없어 팝업 대신 두 번 클릭으로 확정한다.
            if (resetArmed) { replaceAll(DEFAULT_STATE); setResetArmed(false); return; }
            setResetArmed(true);
            setTimeout(() => setResetArmed(false), 3000);
          }}
          style={resetArmed ? { color: "#b91c1c", fontWeight: 700 } : undefined}
        >
          {resetArmed ? "한번 더 누르면 전체 초기화" : "전체 초기화"}
        </button>
      </div>
    </div>
  );
}
