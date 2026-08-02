"use client";

import { useUno } from "./store";
import { Field, NumInput, Segmented, Stars } from "./ui";
import { addDays, computeSleepHours, shortDate, studyTotalOf, todayYmd, weekdayKo } from "./lib";

const EX_TYPES = ["러닝", "헬스", "홈트", "수영", "테니스", "골프", "축구", "요가", "산책", "기타"];

export default function DailyLog({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const { state, patchLog } = useUno();
  const log = state.logs[date];
  const isToday = date === todayYmd();

  const sleep = log?.sleep || {};
  const ex = log?.exercise || { done: false };
  const reading = log?.reading || {};
  const study = log?.study || {};
  const work = log?.work || {};
  const wb = log?.wellbeing || {};
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

        {/* 운동 */}
        <section className="card uno-sec">
          <h3>🏋️ 운동 기록</h3>
          <Field label="오늘 운동했나요?">
            <Segmented
              value={ex.done ? "yes" : "no"}
              onChange={(v) => patchLog(date, { exercise: { ...ex, done: v === "yes" } })}
              options={[
                { value: "yes", label: "했음 ✅" },
                { value: "no", label: "안 함" },
              ]}
            />
          </Field>
          {ex.done && (
            <>
              <Field label="종류">
                <select
                  value={ex.type || ""}
                  onChange={(e) => patchLog(date, { exercise: { ...ex, type: e.target.value } })}
                >
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
                  <NumInput
                    value={ex.minutes}
                    min={0}
                    suffix="분"
                    onChange={(v) => patchLog(date, { exercise: { ...ex, minutes: v } })}
                  />
                </Field>
                <Field label="횟수/세트">
                  <NumInput
                    value={ex.count}
                    min={0}
                    suffix="회"
                    onChange={(v) => patchLog(date, { exercise: { ...ex, count: v } })}
                  />
                </Field>
              </div>
              <Field label="강도">
                <Stars value={ex.intensity} onChange={(v) => patchLog(date, { exercise: { ...ex, intensity: v } })} />
              </Field>
            </>
          )}
        </section>

        {/* 독서 */}
        <section className="card uno-sec">
          <h3>📖 독서</h3>
          <Field label="책 제목">
            <input
              type="text"
              value={reading.book || ""}
              placeholder="읽은 책"
              onChange={(e) => patchLog(date, { reading: { ...reading, book: e.target.value } })}
            />
          </Field>
          <div className="uno-row2">
            <Field label="시간">
              <NumInput
                value={reading.minutes}
                min={0}
                suffix="분"
                onChange={(v) => patchLog(date, { reading: { ...reading, minutes: v } })}
              />
            </Field>
            <Field label="페이지">
              <NumInput
                value={reading.pages}
                min={0}
                suffix="p"
                onChange={(v) => patchLog(date, { reading: { ...reading, pages: v } })}
              />
            </Field>
          </div>
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
          <Field label="오늘 핵심 업무">
            <input
              type="text"
              value={work.note || ""}
              placeholder="가장 중요한 한 건"
              onChange={(e) => patchLog(date, { work: { ...work, note: e.target.value } })}
            />
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
                suffix="잔"
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
    </div>
  );
}
