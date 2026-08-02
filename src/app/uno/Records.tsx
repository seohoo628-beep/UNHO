"use client";

import { useMemo, useState } from "react";
import { useUno } from "./store";
import { BarChart, Segmented, StatCard } from "./ui";
import {
  avg,
  exerciseCount,
  exerciseDone,
  exerciseList,
  exerciseMinutes,
  lastNDays,
  readingList,
  readingMinutes,
  readingPages,
  round1,
  shortDate,
  sleepHoursOf,
  streakFor,
  studyTotalOf,
  sum,
  weekdayKo,
} from "./lib";
import type { DailyLog } from "./types";

type Domain = "sleep" | "exercise" | "reading" | "study" | "work";

const DOMAINS: { value: Domain; label: string }[] = [
  { value: "sleep", label: "😴 수면" },
  { value: "exercise", label: "🏋️ 운동" },
  { value: "reading", label: "📖 독서" },
  { value: "study", label: "📚 공부" },
  { value: "work", label: "💼 업무" },
];

export default function Records() {
  const { state } = useUno();
  const [domain, setDomain] = useState<Domain>("sleep");
  const [days, setDays] = useState(14);
  const target = state.settings.targets || {};

  const dates = useMemo(() => lastNDays(days), [days]);
  const logs = dates.map((d) => state.logs[d]);

  const chart = useMemo(() => {
    return dates.map((d) => {
      const l = state.logs[d];
      const value = domainValue(domain, l);
      return { label: `${shortDate(d)}\n${weekdayKo(d)}`, value, hint: `${shortDate(d)} · ${round1(value)}${domainUnit(domain)}` };
    });
  }, [dates, domain, state.logs]);

  const rows = useMemo(() => {
    return [...dates]
      .reverse()
      .map((d) => ({ date: d, log: state.logs[d] }))
      .filter((r) => domainValue(domain, r.log) > 0 || (domain === "exercise" && exerciseDone(r.log)));
  }, [dates, domain, state.logs]);

  const targetValue = domain === "sleep" ? target.sleepHours : domain === "reading" ? target.readingMinutesPerDay : domain === "study" ? target.studyMinutesPerDay : undefined;

  return (
    <div className="uno-records">
      <Segmented options={DOMAINS} value={domain} onChange={setDomain} />

      <div className="grid cols-3 uno-mt">{summaryCards(domain, state, logs, days)}</div>

      <div className="card uno-mt">
        <div className="uno-card-head">
          <h3>{DOMAINS.find((d) => d.value === domain)?.label} 최근 추이</h3>
          <Segmented
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={[
              { value: "7", label: "7일" },
              { value: "14", label: "14일" },
              { value: "30", label: "30일" },
            ]}
          />
        </div>
        <BarChart data={chart} unit={domainUnit(domain)} target={targetValue} height={150} />
      </div>

      <div className="card uno-mt">
        <h3>기록 내역</h3>
        {rows.length === 0 ? (
          <p className="muted">이 기간에 기록이 없습니다. ‘오늘 기록’ 탭에서 입력해 보세요.</p>
        ) : (
          <div className="uno-table-wrap">
            <table className="uno-table">
              <thead>{headRow(domain)}</thead>
              <tbody>{rows.map((r) => bodyRow(domain, r.date, r.log))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function domainValue(domain: Domain, l?: DailyLog): number {
  switch (domain) {
    case "sleep":
      return sleepHoursOf(l);
    case "exercise":
      return exerciseMinutes(l) || (exerciseDone(l) ? 30 : 0);
    case "reading":
      return readingMinutes(l);
    case "study":
      return studyTotalOf(l);
    case "work":
      return l?.work?.done || 0;
  }
}

function domainUnit(domain: Domain): string {
  return domain === "sleep" ? "시간" : domain === "work" ? "건" : "분";
}

function summaryCards(domain: Domain, state: ReturnType<typeof useUno>["state"], logs: (DailyLog | undefined)[], days: number) {
  if (domain === "sleep") {
    const hrs = logs.map(sleepHoursOf).filter((h) => h > 0);
    return (
      <>
        <StatCard emoji="😴" label="평균 수면" value={round1(avg(hrs))} unit="시간" tone="accent" sub={`최근 ${days}일`} />
        <StatCard emoji="📈" label="기록한 날" value={hrs.length} unit="일" />
        <StatCard emoji="🔥" label="연속 기록" value={streakFor(state.logs, (l) => sleepHoursOf(l) > 0)} unit="일" tone="ok" />
      </>
    );
  }
  if (domain === "exercise") {
    const doneDays = logs.filter(exerciseDone).length;
    const mins = sum(logs.map(exerciseMinutes));
    return (
      <>
        <StatCard emoji="🏋️" label="운동한 날" value={doneDays} unit="일" tone="accent" sub={`최근 ${days}일`} />
        <StatCard emoji="⏱" label="총 운동 시간" value={mins} unit="분" />
        <StatCard emoji="🔥" label="연속 운동" value={streakFor(state.logs, exerciseDone)} unit="일" tone="ok" />
      </>
    );
  }
  if (domain === "reading") {
    const mins = sum(logs.map(readingMinutes));
    const pages = sum(logs.map(readingPages));
    return (
      <>
        <StatCard emoji="📖" label="총 독서" value={mins} unit="분" tone="accent" sub={`최근 ${days}일`} />
        <StatCard emoji="📄" label="읽은 페이지" value={pages} unit="p" />
        <StatCard emoji="🔥" label="연속 독서" value={streakFor(state.logs, (l) => readingMinutes(l) > 0)} unit="일" tone="ok" />
      </>
    );
  }
  if (domain === "study") {
    const total = sum(logs.map(studyTotalOf));
    const eng = sum(logs.map((l) => l?.study?.english || 0));
    const biz = sum(logs.map((l) => l?.study?.business || 0));
    const ai = sum(logs.map((l) => l?.study?.ai || 0));
    return (
      <>
        <StatCard emoji="📚" label="총 공부" value={total} unit="분" tone="accent" sub={`최근 ${days}일`} />
        <StatCard emoji="🧩" label="영어·경영·AI" value={`${eng}·${biz}·${ai}`} sub="분" />
        <StatCard emoji="🔥" label="연속 공부" value={streakFor(state.logs, (l) => studyTotalOf(l) > 0)} unit="일" tone="ok" />
      </>
    );
  }
  const done = sum(logs.map((l) => l?.work?.done || 0));
  const planned = sum(logs.map((l) => l?.work?.planned || 0));
  const focus = sum(logs.map((l) => l?.work?.focusHours || 0));
  return (
    <>
      <StatCard emoji="✅" label="완료 업무" value={done} unit="건" tone="accent" sub={`최근 ${days}일`} />
      <StatCard emoji="🎯" label="완료율" value={planned ? Math.round((done / planned) * 100) : 0} unit="%" />
      <StatCard emoji="🧠" label="집중 시간" value={round1(focus)} unit="시간" tone="ok" />
    </>
  );
}

function headRow(domain: Domain) {
  const cols: Record<Domain, string[]> = {
    sleep: ["날짜", "취침", "기상", "시간", "질"],
    exercise: ["날짜", "종류", "시간", "횟수", "강도"],
    reading: ["날짜", "책", "시간", "페이지"],
    study: ["날짜", "영어", "경영", "AI", "합계"],
    work: ["날짜", "계획", "완료", "집중", "핵심"],
  };
  return (
    <tr>
      {cols[domain].map((c) => (
        <th key={c}>{c}</th>
      ))}
    </tr>
  );
}

function bodyRow(domain: Domain, date: string, l?: DailyLog) {
  const d = (
    <td>
      {shortDate(date)} ({weekdayKo(date)})
    </td>
  );
  if (domain === "sleep")
    return (
      <tr key={date}>
        {d}
        <td>{l?.sleep?.bedtime || "-"}</td>
        <td>{l?.sleep?.wake || "-"}</td>
        <td>{round1(sleepHoursOf(l))}h</td>
        <td>{l?.sleep?.quality ? "★".repeat(l.sleep.quality) : "-"}</td>
      </tr>
    );
  if (domain === "exercise") {
    const exs = exerciseList(l);
    const types = exs.map((e) => e.type).filter(Boolean).join(", ");
    const mins = exerciseMinutes(l);
    const cnt = exerciseCount(l);
    const maxInt = Math.max(0, ...exs.map((e) => e.intensity || 0));
    return (
      <tr key={date}>
        {d}
        <td>{types || (exs.length ? `운동 ${exs.length}건` : "-")}</td>
        <td>{mins ? `${mins}분` : "-"}</td>
        <td>{cnt ? `${cnt}회` : "-"}</td>
        <td>{maxInt ? "★".repeat(maxInt) : "-"}</td>
      </tr>
    );
  }
  if (domain === "reading") {
    const rds = readingList(l);
    const books = rds.map((r) => r.book).filter(Boolean).join(", ");
    return (
      <tr key={date}>
        {d}
        <td>{books || (rds.length ? `독서 ${rds.length}건` : "-")}</td>
        <td>{readingMinutes(l) ? `${readingMinutes(l)}분` : "-"}</td>
        <td>{readingPages(l) ? `${readingPages(l)}p` : "-"}</td>
      </tr>
    );
  }
  if (domain === "study")
    return (
      <tr key={date}>
        {d}
        <td>{l?.study?.english || "-"}</td>
        <td>{l?.study?.business || "-"}</td>
        <td>{l?.study?.ai || "-"}</td>
        <td>
          <strong>{studyTotalOf(l)}분</strong>
        </td>
      </tr>
    );
  return (
    <tr key={date}>
      {d}
      <td>{l?.work?.planned ?? "-"}</td>
      <td>{l?.work?.done ?? "-"}</td>
      <td>{l?.work?.focusHours ? `${l.work.focusHours}h` : "-"}</td>
      <td className="uno-td-note">{l?.work?.note || "-"}</td>
    </tr>
  );
}
