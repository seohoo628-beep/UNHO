"use client";

import { useMemo } from "react";
import { useUno } from "./store";
import { BarChart, Progress, Ring, StatCard } from "./ui";
import {
  METRICS,
  avg,
  exerciseDone,
  exerciseList,
  exerciseMinutes,
  goalProgress,
  hasAnyEntry,
  lastNDays,
  readingList,
  readingMinutes,
  round1,
  shortDate,
  sleepHoursOf,
  startOfWeek,
  streakFor,
  studyTotalOf,
  sum,
  todayYmd,
  weekdayKo,
  workoutVolumeInRange,
} from "./lib";

export default function Dashboard({ goToLog }: { goToLog: () => void }) {
  const { state } = useUno();
  const today = todayYmd();
  const tlog = state.logs[today];
  const targets = state.settings.targets || {};

  const week = useMemo(() => lastNDays(7), []);
  const weekLogs = week.map((d) => state.logs[d]);

  const sleepAvg = round1(avg(weekLogs.map(sleepHoursOf).filter((h) => h > 0)));
  const exDays = weekLogs.filter(exerciseDone).length;
  const studyMin = sum(weekLogs.map(studyTotalOf));
  const readMin = sum(weekLogs.map(readingMinutes));
  const weekVolume = workoutVolumeInRange(state.workouts, week[0], today);

  const studyChart = week.map((d) => ({
    label: `${shortDate(d)}\n${weekdayKo(d)}`,
    value: studyTotalOf(state.logs[d]),
  }));

  const name = state.settings.ownerName?.trim();
  const filledToday = hasAnyEntry(tlog);
  const weekStart = startOfWeek(today);

  return (
    <div className="uno-dash">
      {/* 헤더 인사 + 오늘 입력 유도 */}
      <div className="card uno-hero">
        <div>
          <div className="uno-hero-hi">
            {greeting()} {name ? `${name}님` : ""} 👋
          </div>
          <div className="uno-hero-sub">
            {shortDate(today)} ({weekdayKo(today)}) ·{" "}
            {filledToday ? "오늘 기록이 저장됐어요." : "아직 오늘 기록이 없어요."}
          </div>
        </div>
        <button className="btn primary" onClick={goToLog}>
          {filledToday ? "오늘 기록 이어쓰기" : "오늘 기록하기"}
        </button>
      </div>

      {/* 오늘 스냅샷 */}
      <h3 className="uno-h">오늘 한눈에</h3>
      <div className="grid cols-3">
        <StatCard
          emoji="😴"
          label="수면"
          value={tlog?.sleep ? round1(sleepHoursOf(tlog)) : "-"}
          unit={tlog?.sleep ? "시간" : ""}
          tone="accent"
          sub={targets.sleepHours ? `목표 ${targets.sleepHours}시간` : undefined}
        />
        <StatCard
          emoji="🏋️"
          label="운동"
          value={
            exerciseDone(tlog)
              ? exerciseList(tlog).length > 1
                ? `${exerciseList(tlog).length}건`
                : exerciseList(tlog)[0]?.type || "완료"
              : "미완료"
          }
          tone={exerciseDone(tlog) ? "ok" : "default"}
          sub={exerciseMinutes(tlog) ? `${exerciseMinutes(tlog)}분` : undefined}
        />
        <StatCard emoji="📚" label="공부" value={studyTotalOf(tlog)} unit="분" sub="영어·경영·AI 합계" />
        <StatCard
          emoji="📖"
          label="독서"
          value={readingMinutes(tlog)}
          unit="분"
          sub={readingList(tlog).length > 1 ? `${readingList(tlog).length}권` : readingList(tlog)[0]?.book}
        />
        <StatCard
          emoji="💼"
          label="업무 완료"
          value={tlog?.work?.done || 0}
          unit="건"
          sub={tlog?.work?.planned ? `계획 ${tlog.work.planned}건` : undefined}
        />
        <StatCard
          emoji="💧"
          label="물"
          value={tlog?.wellbeing?.water || 0}
          unit="잔"
          sub={targets.waterCups ? `목표 ${targets.waterCups}잔` : undefined}
        />
        <StatCard
          emoji="🚿"
          label="샤워"
          value={tlog?.wellbeing?.shower || 0}
          unit="회"
          tone={tlog?.wellbeing?.shower ? "ok" : "default"}
        />
        <StatCard
          emoji="🤸"
          label="스트레칭"
          value={tlog?.wellbeing?.stretch || 0}
          unit="회"
          tone={tlog?.wellbeing?.stretch ? "ok" : "default"}
        />
        <StatCard
          emoji="💊"
          label="영양제"
          value={tlog?.supplements?.length || 0}
          unit="종"
          tone={tlog?.supplements?.length ? "ok" : "default"}
          sub={tlog?.supplements?.length ? tlog.supplements.join(", ") : undefined}
        />
        <StatCard
          emoji="🏋️‍♂️"
          label="주간 운동 볼륨"
          value={weekVolume.toLocaleString()}
          unit="kg"
          tone="accent"
          sub="운동일지 합계"
        />
      </div>

      {/* 연속 기록(스트릭) */}
      <h3 className="uno-h">연속 기록 🔥</h3>
      <div className="grid cols-3 uno-streaks">
        {METRICS.map((m) => (
          <div className="card uno-streak" key={m.key}>
            <span className="uno-streak-emoji">{m.emoji}</span>
            <div>
              <div className="uno-streak-n">{streakFor(state.logs, m.active)}일</div>
              <div className="uno-streak-lbl">{m.label} 연속</div>
            </div>
          </div>
        ))}
      </div>

      {/* 이번 주 목표 진행률 */}
      <h3 className="uno-h">이번 주 목표</h3>
      <div className="card">
        {state.goals.length === 0 ? (
          <p className="muted">‘목표·습관’ 탭에서 목표를 추가해 보세요.</p>
        ) : (
          <div className="uno-goalgrid">
            {state.goals.map((g) => {
              const { value, ratio } = goalProgress(g, state);
              return (
                <div className="uno-goalcell" key={g.id}>
                  <Ring ratio={ratio} label={`${g.emoji || "🎯"} ${g.title}`} center={`${Math.round(ratio * 100)}%`} />
                  <div className="uno-goalcell-v">
                    {round1(value)} / {g.target}
                    <span className="muted"> ({g.period === "week" ? "주" : "월"})</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 주간 요약 + 공부 추이 */}
      <div className="grid cols-2 uno-mt">
        <div className="card">
          <h3>이번 주 요약</h3>
          <ul className="uno-weeklist">
            <WeekRow emoji="😴" label="평균 수면" value={`${sleepAvg}시간`} ratio={targets.sleepHours ? sleepAvg / targets.sleepHours : 0} />
            <WeekRow
              emoji="🏋️"
              label="운동한 날"
              value={`${exDays}일`}
              ratio={targets.exerciseDaysPerWeek ? exDays / targets.exerciseDaysPerWeek : 0}
            />
            <WeekRow
              emoji="📚"
              label="공부"
              value={`${studyMin}분`}
              ratio={targets.studyMinutesPerDay ? studyMin / (targets.studyMinutesPerDay * 7) : 0}
            />
            <WeekRow
              emoji="📖"
              label="독서"
              value={`${readMin}분`}
              ratio={targets.readingMinutesPerDay ? readMin / (targets.readingMinutesPerDay * 7) : 0}
            />
          </ul>
          <p className="uno-weeknote muted">주 시작: {shortDate(weekStart)} (월)</p>
        </div>
        <div className="card">
          <h3>공부 시간 (최근 7일)</h3>
          <BarChart data={studyChart} unit="분" target={targets.studyMinutesPerDay} height={150} />
        </div>
      </div>

      {/* 인사이트 */}
      <Insight />
    </div>
  );
}

function WeekRow({ emoji, label, value, ratio }: { emoji: string; label: string; value: string; ratio: number }) {
  return (
    <li className="uno-weekrow">
      <span className="uno-weekrow-lbl">
        {emoji} {label}
      </span>
      <span className="uno-weekrow-bar">
        <Progress ratio={ratio} tone={ratio >= 1 ? "ok" : ratio >= 0.6 ? "accent" : "warn"} />
      </span>
      <span className="uno-weekrow-v">{value}</span>
    </li>
  );
}

// 수면과 에너지의 관계 등 가벼운 인사이트
function Insight() {
  const { state } = useUno();
  const days = lastNDays(30);
  const pairs = days
    .map((d) => state.logs[d])
    .filter((l) => l && sleepHoursOf(l) > 0 && l.wellbeing?.energy)
    .map((l) => ({ sleep: sleepHoursOf(l), energy: l!.wellbeing!.energy! }));

  let msg = "데이터가 쌓이면 수면·컨디션·생산성 사이의 패턴을 알려드려요.";
  if (pairs.length >= 5) {
    const goodSleep = pairs.filter((p) => p.sleep >= 7);
    const badSleep = pairs.filter((p) => p.sleep < 7);
    if (goodSleep.length && badSleep.length) {
      const ge = round1(avg(goodSleep.map((p) => p.energy)));
      const be = round1(avg(badSleep.map((p) => p.energy)));
      msg =
        ge > be
          ? `최근 30일, 7시간 이상 잔 날의 평균 에너지(${ge}/5)가 그렇지 않은 날(${be}/5)보다 높았어요. 수면이 컨디션에 직접 영향을 주고 있어요. 😴`
          : `수면 시간과 에너지의 뚜렷한 관계는 아직 안 보여요. 계속 기록해 볼까요?`;
    }
  }
  return (
    <div className="card uno-insight uno-mt">
      <span className="uno-insight-ico">💡</span>
      <div>
        <strong>인사이트</strong>
        <p>{msg}</p>
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "새벽이에요,";
  if (h < 12) return "좋은 아침이에요,";
  if (h < 18) return "좋은 오후예요,";
  return "좋은 저녁이에요,";
}
