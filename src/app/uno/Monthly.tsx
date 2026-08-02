"use client";

import { useMemo, useState } from "react";
import { useUno } from "./store";
import { BarChart, Progress, Ring, StatCard } from "./ui";
import {
  addMonths,
  aggregate,
  dayScore,
  goalProgress,
  monthDates,
  monthLabel,
  monthMatrix,
  round1,
  sleepHoursOf,
  startOfMonth,
  todayYmd,
} from "./lib";
import type { DailyLog } from "./types";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

export default function Monthly({ openDate }: { openDate: (d: string) => void }) {
  const { state } = useUno();
  const [ref, setRef] = useState<string>(startOfMonth(todayYmd()));
  const isThisMonth = startOfMonth(todayYmd()) === ref;

  const dates = useMemo(() => monthDates(ref), [ref]);
  const prevDates = useMemo(() => monthDates(addMonths(ref, -1)), [ref]);
  const logs = dates.map((d) => state.logs[d]);
  const agg = useMemo(() => aggregate(logs), [logs]);
  const prevAgg = useMemo(() => aggregate(prevDates.map((d) => state.logs[d])), [prevDates, state.logs]);

  const matrix = useMemo(() => monthMatrix(ref), [ref]);
  const scoreChart = useMemo(
    () =>
      dates.map((d) => {
        const l = state.logs[d];
        const r = dayScore(l).ratio;
        return { label: `${Number(d.slice(-2))}`, value: Math.round(r * 100), hint: `${d} · ${dayScore(l).done}/5 습관` };
      }),
    [dates, state.logs],
  );

  const monthGoals = state.goals.filter((g) => g.period === "month");
  const booksFinished = state.books.filter((b) => b.status === "done" && b.finishedAt && b.finishedAt.startsWith(ref.slice(0, 7))).length;

  return (
    <div className="uno-monthly">
      {/* 월 이동 */}
      <div className="card uno-datebar">
        <button className="btn sm" onClick={() => setRef(addMonths(ref, -1))} aria-label="이전 달">
          ‹
        </button>
        <div className="uno-datebar-mid">
          <strong style={{ fontSize: 16 }}>{monthLabel(ref)}</strong>
          {isThisMonth && <span className="badge accent">이번 달</span>}
        </div>
        <button className="btn sm" onClick={() => setRef(addMonths(ref, 1))} disabled={isThisMonth} aria-label="다음 달">
          ›
        </button>
        {!isThisMonth && (
          <button className="btn sm" onClick={() => setRef(startOfMonth(todayYmd()))}>
            이번 달로
          </button>
        )}
      </div>

      {/* 월간 요약(지난달 대비) */}
      <div className="grid cols-3 uno-mt">
        <StatCard emoji="🗓" label="기록한 날" value={agg.activeDays} unit={`/ ${dates.length}일`} tone="accent" sub={delta(agg.activeDays, prevAgg.activeDays, "일")} />
        <StatCard emoji="😴" label="평균 수면" value={agg.sleepAvg} unit="시간" sub={delta(agg.sleepAvg, prevAgg.sleepAvg, "시간")} />
        <StatCard emoji="🏋️" label="운동한 날" value={agg.exDays} unit="일" sub={delta(agg.exDays, prevAgg.exDays, "일")} />
        <StatCard emoji="📚" label="총 공부" value={agg.studyMin} unit="분" sub={delta(agg.studyMin, prevAgg.studyMin, "분")} />
        <StatCard emoji="📖" label="총 독서" value={agg.readMin} unit="분" sub={delta(agg.readMin, prevAgg.readMin, "분")} />
        <StatCard emoji="✅" label="완료 업무" value={agg.workDone} unit="건" sub={delta(agg.workDone, prevAgg.workDone, "건")} />
      </div>

      {/* 달력 + 완성도 */}
      <div className="grid cols-2 uno-mt uno-month-2col">
        <div className="card">
          <h3>{monthLabel(ref)} 달력</h3>
          <p className="muted uno-hint">칸 색이 진할수록 그날 습관 달성이 많아요. 날짜를 누르면 그날 기록으로 이동합니다.</p>
          <div className="uno-cal-grid">
            {WEEKDAYS.map((w) => (
              <div key={w} className="uno-cal-wd">
                {w}
              </div>
            ))}
            {matrix.flat().map((d, i) =>
              d ? (
                <MonthCell key={d} date={d} log={state.logs[d]} onClick={() => d <= todayYmd() && openDate(d)} />
              ) : (
                <div key={`b-${i}`} className="uno-cal-cell empty" />
              ),
            )}
          </div>
          <div className="uno-cal-legend">
            <span>적음</span>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="uno-cal-swatch" style={{ background: scoreColor(n / 5) }} />
            ))}
            <span>많음</span>
          </div>
        </div>

        <div className="card uno-month-ring">
          <h3>이번 달 완성도</h3>
          <Ring ratio={agg.avgScore} size={132} center={`${Math.round(agg.avgScore * 100)}%`} label="평균 습관 달성률" />
          <ul className="uno-month-mini">
            <li>
              <span>🏃 운동</span>
              <strong>{agg.exDays}일 · {agg.exMinutes}분</strong>
            </li>
            <li>
              <span>📚 공부(영·경·AI)</span>
              <strong>{agg.studyByCat.english}·{agg.studyByCat.business}·{agg.studyByCat.ai}분</strong>
            </li>
            <li>
              <span>📖 독서</span>
              <strong>{agg.readMin}분 · {agg.readPages}p</strong>
            </li>
            <li>
              <span>🧠 집중</span>
              <strong>{agg.focusHours}시간</strong>
            </li>
            <li>
              <span>📕 완독</span>
              <strong>{booksFinished}권</strong>
            </li>
          </ul>
        </div>
      </div>

      {/* 일별 완성도 추이 */}
      <div className="card uno-mt">
        <h3>일별 완성도 추이</h3>
        <BarChart data={scoreChart} unit="%" height={130} />
      </div>

      {/* 월간 목표 */}
      {monthGoals.length > 0 && (
        <div className="card uno-mt">
          <h3>월간 목표</h3>
          <div className="uno-month-goals">
            {monthGoals.map((g) => {
              const { value, ratio } = goalProgress(g, state, dates[dates.length - 1]);
              return (
                <div key={g.id} className="uno-month-goal">
                  <div className="uno-goal-head">
                    <span>
                      {g.emoji} <strong>{g.title}</strong>
                    </span>
                    <span className="uno-goal-v">
                      {round1(value)} / {g.target}
                    </span>
                  </div>
                  <Progress ratio={ratio} tone={ratio >= 1 ? "ok" : "accent"} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MonthCell({ date, log, onClick }: { date: string; log?: DailyLog; onClick: () => void }) {
  const { ratio } = dayScore(log);
  const future = date > todayYmd();
  const isToday = date === todayYmd();
  const sleep = sleepHoursOf(log);
  return (
    <button
      className={`uno-cal-cell${isToday ? " today" : ""}${future ? " future" : ""}`}
      style={{ background: future ? undefined : scoreColor(ratio) }}
      onClick={onClick}
      disabled={future}
      title={`${date} · 습관 ${dayScore(log).done}/5${sleep ? ` · 수면 ${sleep}h` : ""}`}
    >
      <span className="uno-cal-day">{Number(date.slice(-2))}</span>
      <span className="uno-cal-marks">
        {log?.exercise?.done && <i>🏋️</i>}
        {sleep > 0 && <em>{sleep}h</em>}
      </span>
    </button>
  );
}

// 완성도(0~1) → 배경색(연보라 → 진보라)
function scoreColor(ratio: number): string {
  if (ratio <= 0) return "var(--surface)";
  const alpha = 0.14 + ratio * 0.7;
  return `rgba(91, 63, 168, ${alpha.toFixed(2)})`;
}

function delta(cur: number, prev: number, unit: string): string {
  const d = round1(cur - prev);
  if (d === 0) return `지난달과 동일`;
  const arrow = d > 0 ? "▲" : "▼";
  return `지난달 대비 ${arrow} ${Math.abs(d)}${unit}`;
}
