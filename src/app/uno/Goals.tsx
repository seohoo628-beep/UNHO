"use client";

import { useMemo, useState } from "react";
import { useUno } from "./store";
import { Progress, Segmented } from "./ui";
import { METRICS, addDays, goalProgress, makeId, round1, startOfWeek, todayYmd, weekdayKo } from "./lib";
import type { Book, Goal, GoalMetric } from "./types";

const METRIC_OPTS: { value: GoalMetric; label: string }[] = [
  { value: "exerciseDays", label: "운동한 날" },
  { value: "studyMinutes", label: "공부 분" },
  { value: "readingMinutes", label: "독서 분" },
  { value: "workDone", label: "완료 업무" },
  { value: "sleepAvgHours", label: "평균 수면(시간)" },
];

export default function Goals() {
  const { state, setState } = useUno();
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<GoalMetric>("exerciseDays");
  const [target, setTarget] = useState(4);
  const [period, setPeriod] = useState<"week" | "month">("week");

  const addGoal = () => {
    if (!title.trim()) return;
    const g: Goal = { id: makeId("g"), title: title.trim(), metric, target, period, emoji: "🎯" };
    setState((p) => ({ ...p, goals: [...p.goals, g] }));
    setTitle("");
  };
  const removeGoal = (id: string) => setState((p) => ({ ...p, goals: p.goals.filter((g) => g.id !== id) }));
  const updateTarget = (id: string, t: number) =>
    setState((p) => ({ ...p, goals: p.goals.map((g) => (g.id === id ? { ...g, target: t } : g)) }));

  return (
    <div className="uno-goals">
      {/* 목표 관리 */}
      <div className="card">
        <h3>🎯 목표</h3>
        <div className="uno-goal-list">
          {state.goals.map((g) => {
            const { value, ratio } = goalProgress(g, state);
            return (
              <div className="uno-goal-item" key={g.id}>
                <div className="uno-goal-head">
                  <span>
                    {g.emoji} <strong>{g.title}</strong>{" "}
                    <span className="muted">({g.period === "week" ? "주간" : "월간"})</span>
                  </span>
                  <span className="uno-goal-v">
                    {round1(value)} /{" "}
                    <input
                      className="uno-mini-num"
                      type="number"
                      value={g.target}
                      min={1}
                      onChange={(e) => updateTarget(g.id, Number(e.target.value) || 0)}
                    />
                    <button className="uno-x" onClick={() => removeGoal(g.id)} aria-label="삭제">
                      ✕
                    </button>
                  </span>
                </div>
                <Progress ratio={ratio} tone={ratio >= 1 ? "ok" : "accent"} />
              </div>
            );
          })}
        </div>

        <div className="uno-goal-form">
          <input
            type="text"
            placeholder="새 목표 (예: 주 3권 독서)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGoal()}
          />
          <select value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)}>
            {METRIC_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            className="uno-mini-num"
            type="number"
            value={target}
            min={1}
            onChange={(e) => setTarget(Number(e.target.value) || 0)}
          />
          <select value={period} onChange={(e) => setPeriod(e.target.value as "week" | "month")}>
            <option value="week">주간</option>
            <option value="month">월간</option>
          </select>
          <button className="btn primary sm" onClick={addGoal}>
            추가
          </button>
        </div>
      </div>

      {/* 습관 히트맵 */}
      <Heatmap />

      {/* 독서 서재 */}
      <Bookshelf />
    </div>
  );
}

function Heatmap() {
  const { state } = useUno();
  const [metricKey, setMetricKey] = useState(METRICS[1].key); // 운동 기본
  const metric = METRICS.find((m) => m.key === metricKey)!;

  // 최근 12주, 월요일 시작, 세로 요일 / 가로 주
  const grid = useMemo(() => {
    const weeks = 12;
    const thisWeekStart = startOfWeek(todayYmd());
    const cols: { date: string; active: boolean; future: boolean }[][] = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const wkStart = addDays(thisWeekStart, -7 * w);
      const col: { date: string; active: boolean; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(wkStart, d);
        col.push({ date, active: metric.active(state.logs[date]), future: date > todayYmd() });
      }
      cols.push(col);
    }
    return cols;
  }, [metric, state.logs]);

  return (
    <div className="card uno-mt">
      <div className="uno-card-head">
        <h3>🔥 습관 히트맵 (최근 12주)</h3>
        <Segmented
          value={metricKey}
          onChange={setMetricKey}
          options={METRICS.map((m) => ({ value: m.key, label: `${m.emoji}` }))}
        />
      </div>
      <div className="uno-heat">
        <div className="uno-heat-days">
          {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="uno-heat-grid">
          {grid.map((col, i) => (
            <div className="uno-heat-col" key={i}>
              {col.map((cell) => (
                <span
                  key={cell.date}
                  className={`uno-heat-cell${cell.active ? " on" : ""}${cell.future ? " future" : ""}`}
                  title={`${cell.date} (${weekdayKo(cell.date)})${cell.active ? " · 완료" : ""}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="muted uno-heat-note">
        {metric.emoji} {metric.label} 기록이 있는 날이 색으로 표시됩니다.
      </p>
    </div>
  );
}

function Bookshelf() {
  const { state, setState } = useUno();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");

  const addBook = () => {
    if (!title.trim()) return;
    const b: Book = { id: makeId("b"), title: title.trim(), author: author.trim() || undefined, status: "reading" };
    setState((p) => ({ ...p, books: [b, ...p.books] }));
    setTitle("");
    setAuthor("");
  };
  const setStatus = (id: string, status: Book["status"]) =>
    setState((p) => ({
      ...p,
      books: p.books.map((b) =>
        b.id === id ? { ...b, status, finishedAt: status === "done" ? todayYmd() : b.finishedAt } : b,
      ),
    }));
  const setRating = (id: string, rating: number) =>
    setState((p) => ({ ...p, books: p.books.map((b) => (b.id === id ? { ...b, rating } : b)) }));
  const remove = (id: string) => setState((p) => ({ ...p, books: p.books.filter((b) => b.id !== id) }));

  const groups: { key: Book["status"]; label: string }[] = [
    { key: "reading", label: "📖 읽는 중" },
    { key: "done", label: "✅ 완독" },
    { key: "want", label: "🔖 읽고 싶은" },
  ];

  return (
    <div className="card uno-mt">
      <h3>📚 독서 서재</h3>
      <div className="uno-book-form">
        <input type="text" placeholder="책 제목" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addBook()} />
        <input type="text" placeholder="저자(선택)" value={author} onChange={(e) => setAuthor(e.target.value)} />
        <button className="btn primary sm" onClick={addBook}>
          담기
        </button>
      </div>
      {state.books.length === 0 ? (
        <p className="muted">서재가 비어 있어요. 읽고 있는 책을 담아보세요.</p>
      ) : (
        groups.map((grp) => {
          const list = state.books.filter((b) => b.status === grp.key);
          if (list.length === 0) return null;
          return (
            <div key={grp.key} className="uno-book-group">
              <div className="uno-book-group-h">{grp.label} · {list.length}</div>
              {list.map((b) => (
                <div className="uno-book" key={b.id}>
                  <div className="uno-book-info">
                    <strong>{b.title}</strong>
                    {b.author && <span className="muted"> · {b.author}</span>}
                    {b.status === "done" && (
                      <span className="uno-book-stars">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} className={`uno-star sm${(b.rating || 0) >= n ? " on" : ""}`} onClick={() => setRating(b.id, b.rating === n ? 0 : n)} aria-label={`${n}점`}>
                            ★
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="uno-book-actions">
                    <select value={b.status} onChange={(e) => setStatus(b.id, e.target.value as Book["status"])}>
                      <option value="want">읽고 싶은</option>
                      <option value="reading">읽는 중</option>
                      <option value="done">완독</option>
                    </select>
                    <button className="uno-x" onClick={() => remove(b.id)} aria-label="삭제">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
