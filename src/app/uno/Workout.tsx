"use client";

import { useMemo, useState } from "react";
import { useUno } from "./store";
import { NumInput } from "./ui";
import { addDays, makeId, sessionSets, sessionVolume, shortDate, todayYmd, weekdayKo } from "./lib";
import type { WorkoutExercise, WorkoutSession } from "./types";

// 번핏 스타일 부위 + 대표 종목(자동완성용)
const PARTS = ["가슴", "등", "어깨", "하체", "팔", "복근", "유산소", "전신"];
const PRESETS: Record<string, string[]> = {
  가슴: ["벤치프레스", "인클라인 벤치프레스", "덤벨 프레스", "체스트 플라이", "딥스", "푸시업"],
  등: ["데드리프트", "랫풀다운", "바벨로우", "시티드 로우", "풀업", "T바 로우"],
  어깨: ["오버헤드 프레스", "사이드 레터럴 레이즈", "페이스 풀", "리어 델트 플라이"],
  하체: ["스쿼트", "레그프레스", "런지", "레그 익스텐션", "레그 컬", "힙 쓰러스트", "카프 레이즈"],
  팔: ["바벨 컬", "덤벨 컬", "해머 컬", "트라이셉스 익스텐션", "케이블 푸시다운"],
  복근: ["크런치", "플랭크", "레그 레이즈", "러시안 트위스트"],
  유산소: ["러닝", "사이클", "로잉", "계단", "걷기"],
  전신: ["버피", "클린 앤 프레스", "케틀벨 스윙", "스내치"],
};
const ALL_PRESETS = Array.from(new Set(Object.values(PRESETS).flat()));

export default function Workout() {
  const { state, setState } = useUno();
  const [date, setDate] = useState<string>(todayYmd());

  const sessions = useMemo(
    () => state.workouts.filter((w) => w.date === date),
    [state.workouts, date],
  );
  const history = useMemo(
    () => [...state.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
    [state.workouts],
  );

  const updateWorkouts = (fn: (ws: WorkoutSession[]) => WorkoutSession[]) =>
    setState((p) => ({ ...p, workouts: fn(p.workouts) }));
  const updateSession = (sid: string, up: (s: WorkoutSession) => WorkoutSession) =>
    updateWorkouts((ws) => ws.map((s) => (s.id === sid ? up(s) : s)));
  const updateExercise = (sid: string, exid: string, up: (e: WorkoutExercise) => WorkoutExercise) =>
    updateSession(sid, (s) => ({ ...s, exercises: s.exercises.map((e) => (e.id === exid ? up(e) : e)) }));

  const addSession = () =>
    updateWorkouts((ws) => [...ws, { id: makeId("ws"), date, title: "", exercises: [] }]);
  const removeSession = (sid: string) => updateWorkouts((ws) => ws.filter((s) => s.id !== sid));
  const addExercise = (sid: string, name: string, part: string) =>
    updateSession(sid, (s) => ({
      ...s,
      exercises: [...s.exercises, { id: makeId("we"), name, part, sets: [{}] }],
    }));
  const removeExercise = (sid: string, exid: string) =>
    updateSession(sid, (s) => ({ ...s, exercises: s.exercises.filter((e) => e.id !== exid) }));
  const addSet = (sid: string, exid: string) =>
    updateExercise(sid, exid, (e) => {
      const last = e.sets[e.sets.length - 1];
      return { ...e, sets: [...e.sets, last ? { weight: last.weight, reps: last.reps } : {}] };
    });
  const updateSet = (sid: string, exid: string, i: number, patch: Partial<WorkoutSession["exercises"][0]["sets"][0]>) =>
    updateExercise(sid, exid, (e) => ({ ...e, sets: e.sets.map((st, idx) => (idx === i ? { ...st, ...patch } : st)) }));
  const removeSet = (sid: string, exid: string, i: number) =>
    updateExercise(sid, exid, (e) => ({ ...e, sets: e.sets.filter((_, idx) => idx !== i) }));

  return (
    <div className="uno-workout">
      {/* 날짜 이동 */}
      <div className="card uno-datebar">
        <button className="btn sm" onClick={() => setDate(addDays(date, -1))} aria-label="이전 날">
          ‹
        </button>
        <div className="uno-datebar-mid">
          <input type="date" value={date} max={todayYmd()} onChange={(e) => setDate(e.target.value || todayYmd())} />
          <span className="uno-dow">
            {shortDate(date)} ({weekdayKo(date)}) {date === todayYmd() && <span className="badge accent">오늘</span>}
          </span>
        </div>
        <button className="btn sm" onClick={() => setDate(addDays(date, 1))} disabled={date >= todayYmd()} aria-label="다음 날">
          ›
        </button>
      </div>

      {sessions.length === 0 && (
        <div className="card uno-wo-empty">
          <div style={{ fontSize: 34 }}>🏋️‍♂️</div>
          <p className="muted">이 날의 운동 기록이 없어요. 운동을 시작해 보세요.</p>
          <button className="btn primary" onClick={addSession}>
            + 운동 시작
          </button>
        </div>
      )}

      {sessions.map((s) => (
        <div className="card uno-wo-session" key={s.id}>
          <div className="uno-wo-shead">
            <input
              className="uno-wo-title"
              type="text"
              placeholder="운동 이름 (예: 가슴+삼두)"
              value={s.title || ""}
              onChange={(e) => updateSession(s.id, (ss) => ({ ...ss, title: e.target.value }))}
            />
            <button className="uno-x" onClick={() => removeSession(s.id)} aria-label="세션 삭제">
              ✕
            </button>
          </div>

          <div className="uno-wo-summary">
            <span>
              💪 볼륨 <strong>{sessionVolume(s).toLocaleString()}</strong> kg
            </span>
            <span>
              📊 세트 <strong>{sessionSets(s)}</strong>
            </span>
            <span>
              🏷 종목 <strong>{s.exercises.length}</strong>
            </span>
            <span className="uno-wo-dur">
              ⏱
              <NumInput
                value={s.durationMin}
                min={0}
                suffix="분"
                onChange={(v) => updateSession(s.id, (ss) => ({ ...ss, durationMin: v }))}
              />
            </span>
          </div>

          {s.exercises.map((ex) => (
            <div className="uno-wo-ex" key={ex.id}>
              <div className="uno-wo-exhead">
                <div className="uno-wo-exname">
                  {ex.part && <span className="badge accent">{ex.part}</span>}
                  <strong>{ex.name}</strong>
                </div>
                <button className="uno-x" onClick={() => removeExercise(s.id, ex.id)} aria-label="종목 삭제">
                  ✕
                </button>
              </div>
              <table className="uno-wo-sets">
                <thead>
                  <tr>
                    <th>세트</th>
                    <th>kg</th>
                    <th>회</th>
                    <th>✓</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ex.sets.map((st, i) => (
                    <tr key={i} className={st.done ? "done" : ""}>
                      <td>{i + 1}</td>
                      <td>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={st.weight ?? ""}
                          onChange={(e) =>
                            updateSet(s.id, ex.id, i, { weight: e.target.value === "" ? undefined : Number(e.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={st.reps ?? ""}
                          onChange={(e) =>
                            updateSet(s.id, ex.id, i, { reps: e.target.value === "" ? undefined : Number(e.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <button
                          className={`uno-wo-check${st.done ? " on" : ""}`}
                          onClick={() => updateSet(s.id, ex.id, i, { done: !st.done })}
                          aria-label="세트 완료"
                        >
                          ✓
                        </button>
                      </td>
                      <td>
                        <button className="uno-x" onClick={() => removeSet(s.id, ex.id, i)} aria-label="세트 삭제">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn sm uno-add-btn" onClick={() => addSet(s.id, ex.id)}>
                + 세트 추가
              </button>
            </div>
          ))}

          <AddExercise onAdd={(name, part) => addExercise(s.id, name, part)} />
        </div>
      ))}

      {sessions.length > 0 && (
        <button className="btn uno-add-btn uno-mt" onClick={addSession}>
          + 운동 세션 추가
        </button>
      )}

      {/* 히스토리 */}
      <div className="card uno-mt">
        <h3>📚 최근 운동 기록</h3>
        {history.length === 0 ? (
          <p className="muted">아직 기록이 없어요.</p>
        ) : (
          <ul className="uno-wo-history">
            {history.map((s) => (
              <li key={s.id} onClick={() => setDate(s.date)}>
                <div className="uno-wo-hdate">
                  {shortDate(s.date)} ({weekdayKo(s.date)})
                </div>
                <div className="uno-wo-hbody">
                  <strong>{s.title || "운동"}</strong>
                  <span className="muted">
                    {" "}
                    · {s.exercises.length}종목 · {sessionSets(s)}세트
                  </span>
                </div>
                <div className="uno-wo-hvol">{sessionVolume(s).toLocaleString()}kg</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddExercise({ onAdd }: { onAdd: (name: string, part: string) => void }) {
  const [name, setName] = useState("");
  const [part, setPart] = useState(PARTS[0]);
  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), part);
    setName("");
  };
  return (
    <div className="uno-wo-addex">
      <select value={part} onChange={(e) => setPart(e.target.value)} aria-label="부위">
        {PARTS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <input
        type="text"
        list="uno-wo-presets"
        placeholder="종목명 (예: 벤치프레스)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <datalist id="uno-wo-presets">
        {ALL_PRESETS.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <button className="btn primary sm" onClick={submit}>
        + 종목
      </button>
    </div>
  );
}
