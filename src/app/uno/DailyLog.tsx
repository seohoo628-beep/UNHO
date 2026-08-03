"use client";

import { useEffect, useState } from "react";
import { useUno } from "./store";
import { Field, NumInput, Segmented, Stars } from "./ui";
import {
  CARE_ITEMS,
  addDays,
  computeSleepHours,
  exerciseList,
  readingList,
  shortDate,
  studyTotalOf,
  todayYmd,
  weekdayKo,
} from "./lib";
import type { Exercise, Reading } from "./types";

const COMMON_SUPPS = ["종합비타민", "오메가3", "비타민D", "비타민C", "유산균", "마그네슘", "아연", "밀크씨슬", "루테인", "단백질"];

const TRAINING_ITEMS = [
  { label: "호흡", emoji: "🫁" },
  { label: "보컬", emoji: "🎤" },
  { label: "스피치", emoji: "🗣" },
  { label: "댄스", emoji: "💃" },
];

const SKINCARE_ITEMS = [
  { label: "세안", emoji: "🧼" },
  { label: "보습", emoji: "💧" },
  { label: "디바이스", emoji: "📟" },
  { label: "선크림", emoji: "☀️" },
];

const EX_TYPES = [
  "러닝",
  "헬스",
  "홈트",
  "수영",
  "테니스",
  "골프",
  "축구",
  "야구",
  "아이스하키",
  "하이록스",
  "요가",
  "산책",
  "기타",
];

export default function DailyLog({
  date,
  setDate,
  onDone,
}: {
  date: string;
  setDate: (d: string) => void;
  onDone?: () => void;
}) {
  const { state, patchLog } = useUno();
  const log = state.logs[date];
  const isToday = date === todayYmd();

  const [suppInput, setSuppInput] = useState("");

  // 입력은 즉시 자동 저장된다. 아래 버튼은 "저장됨" 확인 피드백 + 대시보드 이동용.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const sleep = log?.sleep || {};
  const study = log?.study || {};

  // 운동·독서는 하루 여러 개. 편집 시 배열(exercises/readings)에 쓰고 레거시 단일 필드는 비운다.
  const exList = exerciseList(log);
  const rdList = readingList(log);
  const setExercises = (arr: Exercise[]) => patchLog(date, { exercises: arr, exercise: undefined });
  const addExercise = () => setExercises([...exList, { done: true }]);
  const updateExercise = (i: number, patch: Partial<Exercise>) =>
    setExercises(exList.map((e, idx) => (idx === i ? { ...e, ...patch, done: true } : e)));
  const removeExercise = (i: number) => setExercises(exList.filter((_, idx) => idx !== i));
  const setReadings = (arr: Reading[]) => patchLog(date, { readings: arr, reading: undefined });
  const addReading = () => setReadings([...rdList, {}]);
  const updateReading = (i: number, patch: Partial<Reading>) =>
    setReadings(rdList.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeReading = (i: number) => setReadings(rdList.filter((_, idx) => idx !== i));

  const work = log?.work || {};
  // 핵심 업무 3가지(레거시 단일 note 호환)
  const workTasks = work.tasks && work.tasks.length ? work.tasks : work.note ? [work.note] : [];
  const setWorkTask = (i: number, val: string) => {
    const base = work.tasks && work.tasks.length ? [...work.tasks] : work.note ? [work.note] : [];
    base[i] = val;
    patchLog(date, { work: { ...work, tasks: base, note: undefined } });
  };
  const wb = log?.wellbeing || {};
  const diet = log?.diet || {};
  const care = log?.care || [];
  const toggleCare = (id: string) =>
    patchLog(date, { care: care.includes(id) ? care.filter((c) => c !== id) : [...care, id] });
  const training = log?.training || [];
  const toggleTraining = (name: string) =>
    patchLog(date, { training: training.includes(name) ? training.filter((t) => t !== name) : [...training, name] });
  const skincare = log?.skincare || [];
  const toggleSkincare = (name: string) =>
    patchLog(date, { skincare: skincare.includes(name) ? skincare.filter((s) => s !== name) : [...skincare, name] });

  // 영양제(복용 종류 목록)
  const supplements = log?.supplements || [];
  const toggleSupp = (name: string) =>
    patchLog(date, {
      supplements: supplements.includes(name) ? supplements.filter((s) => s !== name) : [...supplements, name],
    });
  const addSupp = () => {
    const v = suppInput.trim();
    if (!v || supplements.includes(v)) {
      setSuppInput("");
      return;
    }
    patchLog(date, { supplements: [...supplements, v] });
    setSuppInput("");
  };
  const autoHours = computeSleepHours(sleep.bedtime, sleep.wake);

  return (
    <div className="uno-daily">
      {/* 날짜 이동 */}
      <div className="card uno-datebar">
        <button className="btn sm" onClick={() => setDate(addDays(date, -1))} aria-label="이전 날">
          ‹
        </button>
        <div className="uno-datebar-mid">
          <input type="date" value={date} max={todayYmd()} onChange={(e) => setDate(e.target.value || todayYmd())} />
          <span className="uno-dow">
            {shortDate(date)} ({weekdayKo(date)}) {isToday && <span className="badge accent">오늘</span>}
          </span>
        </div>
        <button
          className="btn sm"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= todayYmd()}
          aria-label="다음 날"
        >
          ›
        </button>
        {!isToday && (
          <button className="btn sm" onClick={() => setDate(todayYmd())}>
            오늘로
          </button>
        )}
        <span className="uno-autosave">✓ 자동 저장</span>
      </div>

      <div className="grid uno-log-grid">
        {/* 수면 */}
        <section className="card uno-sec">
          <h3>😴 수면 일지</h3>
          <div className="uno-row2">
            <Field label="취침">
              <input
                type="time"
                value={sleep.bedtime || ""}
                onChange={(e) => patchLog(date, { sleep: { ...sleep, bedtime: e.target.value } })}
              />
            </Field>
            <Field label="기상">
              <input
                type="time"
                value={sleep.wake || ""}
                onChange={(e) => patchLog(date, { sleep: { ...sleep, wake: e.target.value } })}
              />
            </Field>
          </div>
          <Field label="수면 시간" hint={autoHours != null ? `자동 ${autoHours}시간` : undefined}>
            <NumInput
              value={sleep.hours ?? autoHours}
              step={0.5}
              min={0}
              max={24}
              suffix="시간"
              onChange={(v) => patchLog(date, { sleep: { ...sleep, hours: v } })}
            />
          </Field>
          <Field label="수면의 질">
            <Stars value={sleep.quality} onChange={(v) => patchLog(date, { sleep: { ...sleep, quality: v } })} />
          </Field>
        </section>

        {/* 운동 — 여러 개 추가 가능 */}
        <section className="card uno-sec">
          <h3>🏋️ 운동 기록 {exList.length > 0 && `· ${exList.length}건`}</h3>
          {exList.length === 0 && <p className="muted uno-hint">오늘 한 운동을 추가하세요.</p>}
          {exList.map((e, i) => (
            <div className="uno-multi-item" key={i}>
              <div className="uno-multi-head">
                <span className="uno-multi-idx">운동 {i + 1}</span>
                <button className="uno-x" onClick={() => removeExercise(i)} aria-label="삭제">
                  ✕
                </button>
              </div>
              <Field label="종류">
                <select value={e.type || ""} onChange={(ev) => updateExercise(i, { type: ev.target.value })}>
                  <option value="">선택</option>
                  {EX_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="uno-row2">
                <Field label="시간">
                  <NumInput value={e.minutes} min={0} suffix="분" onChange={(v) => updateExercise(i, { minutes: v })} />
                </Field>
                <Field label="횟수/세트">
                  <NumInput value={e.count} min={0} suffix="회" onChange={(v) => updateExercise(i, { count: v })} />
                </Field>
              </div>
              <Field label="강도">
                <Stars value={e.intensity} onChange={(v) => updateExercise(i, { intensity: v })} />
              </Field>
            </div>
          ))}
          <button className="btn sm uno-add-btn" onClick={addExercise}>
            + 운동 추가
          </button>
        </section>

        {/* 독서 — 여러 권/세션 추가 가능 */}
        <section className="card uno-sec">
          <h3>📖 독서 {rdList.length > 0 && `· ${rdList.length}건`}</h3>
          {rdList.length === 0 && <p className="muted uno-hint">읽은 책을 추가하세요.</p>}
          {rdList.map((r, i) => (
            <div className="uno-multi-item" key={i}>
              <div className="uno-multi-head">
                <span className="uno-multi-idx">독서 {i + 1}</span>
                <button className="uno-x" onClick={() => removeReading(i)} aria-label="삭제">
                  ✕
                </button>
              </div>
              <Field label="책 제목">
                <input
                  type="text"
                  value={r.book || ""}
                  placeholder="읽은 책"
                  onChange={(ev) => updateReading(i, { book: ev.target.value })}
                />
              </Field>
              <div className="uno-row2">
                <Field label="시간">
                  <NumInput value={r.minutes} min={0} suffix="분" onChange={(v) => updateReading(i, { minutes: v })} />
                </Field>
                <Field label="페이지">
                  <NumInput value={r.pages} min={0} suffix="p" onChange={(v) => updateReading(i, { pages: v })} />
                </Field>
              </div>
            </div>
          ))}
          <button className="btn sm uno-add-btn" onClick={addReading}>
            + 독서 추가
          </button>
        </section>

        {/* 공부: 영어·경영·AI */}
        <section className="card uno-sec">
          <h3>📚 공부 · 오늘 {studyTotalOf(log)}분</h3>
          <Field label="🇬🇧 영어">
            <NumInput
              value={study.english}
              min={0}
              suffix="분"
              onChange={(v) => patchLog(date, { study: { ...study, english: v } })}
            />
          </Field>
          <Field label="📈 경영">
            <NumInput
              value={study.business}
              min={0}
              suffix="분"
              onChange={(v) => patchLog(date, { study: { ...study, business: v } })}
            />
          </Field>
          <Field label="🤖 AI">
            <NumInput
              value={study.ai}
              min={0}
              suffix="분"
              onChange={(v) => patchLog(date, { study: { ...study, ai: v } })}
            />
          </Field>
          <Field label="오늘 배운 것">
            <input
              type="text"
              value={study.note || ""}
              placeholder="한 줄 메모"
              onChange={(e) => patchLog(date, { study: { ...study, note: e.target.value } })}
            />
          </Field>
        </section>

        {/* 업무 시트 트래킹 */}
        <section className="card uno-sec">
          <h3>💼 업무 트래킹</h3>
          <div className="uno-row2">
            <Field label="계획 업무">
              <NumInput
                value={work.planned}
                min={0}
                suffix="건"
                onChange={(v) => patchLog(date, { work: { ...work, planned: v } })}
              />
            </Field>
            <Field label="완료 업무">
              <NumInput
                value={work.done}
                min={0}
                suffix="건"
                onChange={(v) => patchLog(date, { work: { ...work, done: v } })}
              />
            </Field>
          </div>
          <Field label="집중(딥워크) 시간">
            <NumInput
              value={work.focusHours}
              min={0}
              step={0.5}
              suffix="시간"
              onChange={(v) => patchLog(date, { work: { ...work, focusHours: v } })}
            />
          </Field>
          <Field label="오늘 핵심 업무 (최대 3)">
            <div className="uno-worktasks">
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  type="text"
                  value={workTasks[i] || ""}
                  placeholder={`업무 ${i + 1}`}
                  onChange={(e) => setWorkTask(i, e.target.value)}
                />
              ))}
            </div>
          </Field>
        </section>

        {/* 컨디션 */}
        <section className="card uno-sec">
          <h3>🌤 컨디션</h3>
          <Field label="기분">
            <Stars value={wb.mood} onChange={(v) => patchLog(date, { wellbeing: { ...wb, mood: v } })} />
          </Field>
          <Field label="에너지">
            <Stars value={wb.energy} onChange={(v) => patchLog(date, { wellbeing: { ...wb, energy: v } })} />
          </Field>
          <div className="uno-row2">
            <Field label="물">
              <NumInput
                value={wb.water}
                min={0}
                step={100}
                suffix="ml"
                onChange={(v) => patchLog(date, { wellbeing: { ...wb, water: v } })}
              />
            </Field>
            <Field label="체중">
              <NumInput
                value={wb.weight}
                min={0}
                step={0.1}
                suffix="kg"
                onChange={(v) => patchLog(date, { wellbeing: { ...wb, weight: v } })}
              />
            </Field>
          </div>
          <div className="uno-row2">
            <Field label="🚿 샤워">
              <NumInput
                value={wb.shower}
                min={0}
                suffix="회"
                onChange={(v) => patchLog(date, { wellbeing: { ...wb, shower: v } })}
              />
            </Field>
            <Field label="🤸 스트레칭">
              <NumInput
                value={wb.stretch}
                min={0}
                suffix="회"
                onChange={(v) => patchLog(date, { wellbeing: { ...wb, stretch: v } })}
              />
            </Field>
          </div>
        </section>

        {/* 영양제 */}
        <section className="card uno-sec">
          <h3>💊 영양제 {supplements.length > 0 && `· ${supplements.length}종`}</h3>
          <div className="uno-supp-chips">
            {COMMON_SUPPS.map((name) => (
              <button
                key={name}
                type="button"
                className={`uno-chip${supplements.includes(name) ? " on" : ""}`}
                onClick={() => toggleSupp(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {supplements.filter((s) => !COMMON_SUPPS.includes(s)).length > 0 && (
            <div className="uno-supp-chips uno-supp-custom">
              {supplements
                .filter((s) => !COMMON_SUPPS.includes(s))
                .map((name) => (
                  <button key={name} type="button" className="uno-chip on" onClick={() => toggleSupp(name)}>
                    {name} ✕
                  </button>
                ))}
            </div>
          )}
          <div className="uno-supp-add">
            <input
              type="text"
              placeholder="직접 추가 (예: 코엔자임Q10)"
              value={suppInput}
              onChange={(e) => setSuppInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSupp()}
            />
            <button className="btn sm" onClick={addSupp}>
              추가
            </button>
          </div>
        </section>

        {/* 식단 */}
        <section className="card uno-sec">
          <h3>🥗 식단</h3>
          <Field label="식단 지켰나요?">
            <Segmented
              value={diet.followed ? "yes" : "no"}
              onChange={(v) => patchLog(date, { diet: { ...diet, followed: v === "yes" } })}
              options={[
                { value: "yes", label: "지킴 ✅" },
                { value: "no", label: "못 지킴" },
              ]}
            />
          </Field>
          <Field label="단백질 섭취량">
            <NumInput
              value={diet.protein}
              min={0}
              suffix="g"
              onChange={(v) => patchLog(date, { diet: { ...diet, protein: v } })}
            />
          </Field>
          <Field label="식단 메모">
            <input
              type="text"
              value={diet.note || ""}
              placeholder="오늘 먹은 것 / 특이사항"
              onChange={(e) => patchLog(date, { diet: { ...diet, note: e.target.value } })}
            />
          </Field>
        </section>

        {/* 주기 관리(이발·피부과) */}
        <section className="card uno-sec">
          <h3>✂️ 관리 (그날 한 것 체크)</h3>
          <p className="muted uno-hint">이발(2주 주기)·피부과 제모·관리(월 주기). 다음 예정일은 대시보드에서 확인하세요.</p>
          <div className="uno-supp-chips">
            {CARE_ITEMS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`uno-chip${care.includes(c.id) ? " on" : ""}`}
                onClick={() => toggleCare(c.id)}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </section>

        {/* 훈련(호흡·보컬·스피치·댄스) */}
        <section className="card uno-sec">
          <h3>🎤 훈련 {training.length > 0 && `· ${training.length}종`}</h3>
          <div className="uno-supp-chips">
            {TRAINING_ITEMS.map((t) => (
              <button
                key={t.label}
                type="button"
                className={`uno-chip${training.includes(t.label) ? " on" : ""}`}
                onClick={() => toggleTraining(t.label)}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </section>

        {/* 피부관리(세안·보습·디바이스·선크림) */}
        <section className="card uno-sec">
          <h3>🧴 피부관리 {skincare.length > 0 && `· ${skincare.length}종`}</h3>
          <div className="uno-supp-chips">
            {SKINCARE_ITEMS.map((s) => (
              <button
                key={s.label}
                type="button"
                className={`uno-chip${skincare.includes(s.label) ? " on" : ""}`}
                onClick={() => toggleSkincare(s.label)}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* 하루 메모 */}
      <section className="card uno-sec">
        <h3>📝 하루 회고</h3>
        <textarea
          className="uno-textarea"
          rows={3}
          value={log?.note || ""}
          placeholder="오늘 하루를 한 줄로 남겨보세요."
          onChange={(e) => patchLog(date, { note: e.target.value })}
        />
      </section>

      {/* 저장 확인 바 — 입력은 자동 저장되며, 이 버튼은 완료 확인/이동용 */}
      <div className="uno-savebar">
        <span className="uno-savebar-note">
          {flash ? "오늘 기록이 저장되었어요 ✅" : "입력하는 즉시 자동 저장되고 모든 기기에 동기화됩니다."}
        </span>
        <div className="uno-savebar-btns">
          <button className="btn" onClick={() => setFlash(true)}>
            💾 저장 확인
          </button>
          {onDone && (
            <button
              className="btn primary"
              onClick={() => {
                setFlash(true);
                onDone();
              }}
            >
              저장하고 대시보드 보기 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
