"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type CalEvent = {
  date: string; // YYYY-MM-DD
  kind: "todo" | "meeting" | "leave";
  title: string;
  link: string;
  sub?: string;
};

const KIND_COLOR: Record<CalEvent["kind"], string> = {
  todo: "#6366f1",
  meeting: "#0ea5e9",
  leave: "#10b981",
};
const KIND_LABEL: Record<CalEvent["kind"], string> = { todo: "업무", meeting: "미팅", leave: "연차" };
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function ymShift(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CalendarClient({
  ym,
  events,
  today,
}: {
  ym: string;
  events: CalEvent[];
  today: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"month" | "timeline">("month");

  const [year, month] = ym.split("-").map(Number);

  const byDate = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date)!.push(e);
    }
    return m;
  }, [events]);

  // 달력 셀(앞뒤 달 채움)
  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const arr: { date: string; inMonth: boolean; day: number }[] = [];
    // 앞 달
    const prevDays = new Date(year, month - 1, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = prevDays - i;
      const pm = ymShift(ym, -1);
      arr.push({ date: `${pm}-${String(d).padStart(2, "0")}`, inMonth: false, day: d });
    }
    // 이번 달
    for (let d = 1; d <= daysInMonth; d++) {
      arr.push({ date: `${ym}-${String(d).padStart(2, "0")}`, inMonth: true, day: d });
    }
    // 뒤 달(마지막 주 채우기)
    while (arr.length % 7 !== 0) {
      const nm = ymShift(ym, 1);
      const d = arr.length % 7 === 0 ? 1 : arr.filter((c) => !c.inMonth && c.date.startsWith(nm)).length + 1;
      arr.push({ date: `${nm}-${String(d).padStart(2, "0")}`, inMonth: false, day: d });
    }
    return arr;
  }, [year, month, ym]);

  const go = (delta: number) => router.push(`/calendar?ym=${ymShift(ym, delta)}`);
  const goToday = () => router.push(`/calendar?ym=${today.slice(0, 7)}`);

  const monthEvents = useMemo(
    () => events.filter((e) => e.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date)),
    [events, ym]
  );

  const [kakaoHint, setKakaoHint] = useState<string | null>(null);
  // 이번 달 타임라인을 카톡용 텍스트로 만들어 공유(미지원 시 복사 후 카톡 열기).
  const sendKakao = async () => {
    setKakaoHint(null);
    const lines: string[] = [`📅 ${year}년 ${month}월 일정`];
    let lastDate = "";
    for (const e of monthEvents) {
      if (e.date !== lastDate) {
        const d = Number(e.date.slice(8, 10));
        const wd = WEEKDAYS[new Date(year, month - 1, d).getDay()];
        lines.push(`\n[${month}/${d}(${wd})]`);
        lastDate = e.date;
      }
      lines.push(`· ${KIND_LABEL[e.kind]} ${e.title}${e.sub ? ` (${e.sub})` : ""}`);
    }
    if (monthEvents.length === 0) lines.push("\n등록된 일정이 없습니다.");
    const text = lines.join("\n");
    const nav = navigator as any;
    try {
      if (nav.share) { await nav.share({ title: `${year}년 ${month}월 일정`, text }); return; }
    } catch (e: any) {
      if (e && e.name === "AbortError") return;
    }
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    try { window.location.href = "kakaotalk://"; } catch { /* ignore */ }
    setKakaoHint("📋 일정이 복사됐어요. 카카오톡 대화창에 붙여넣어 전달하세요.");
    setTimeout(() => setKakaoHint(null), 8000);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button className="btn sm" onClick={() => go(-1)}>‹ 이전</button>
        <div style={{ fontWeight: 700, fontSize: 16, minWidth: 110, textAlign: "center" }}>
          {year}년 {month}월
        </div>
        <button className="btn sm" onClick={() => go(1)}>다음 ›</button>
        <button className="btn sm" onClick={goToday}>오늘</button>
        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          <button className={`btn sm${view === "month" ? " primary" : ""}`} onClick={() => setView("month")}>달력</button>
          <button className={`btn sm${view === "timeline" ? " primary" : ""}`} onClick={() => setView("timeline")}>타임라인</button>
          <button className="btn sm" onClick={sendKakao} title="이번 달 일정을 카톡으로 전달" style={{ background: "#fee500", borderColor: "#fee500", color: "#3c1e1e", fontWeight: 700, whiteSpace: "nowrap" }}>🟡 카톡 발송</button>
        </div>
      </div>
      {kakaoHint && (
        <div style={{ fontSize: 12, marginBottom: 10, color: "#92400e", background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: "6px 8px" }}>{kakaoHint}</div>
      )}

      {/* 범례 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        {(["todo", "meeting", "leave"] as const).map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-2)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: KIND_COLOR[k] }} />
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>

      {view === "month" ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {/* 요일 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", borderBottom: "1px solid var(--border,#e5e7eb)" }}>
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                style={{
                  padding: "7px 0",
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: i === 0 ? "#ef4444" : i === 6 ? "#3b82f6" : "var(--ink-2)",
                }}
              >
                {w}
              </div>
            ))}
          </div>
          {/* 날짜 그리드 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
            {cells.map((c, idx) => {
              const evs = byDate.get(c.date) ?? [];
              const isToday = c.date === today;
              const weekday = idx % 7;
              return (
                <div
                  key={c.date + idx}
                  style={{
                    minWidth: 0,
                    minHeight: 88,
                    borderRight: weekday === 6 ? "none" : "1px solid var(--border,#eef0f2)",
                    borderBottom: "1px solid var(--border,#eef0f2)",
                    padding: 4,
                    background: c.inMonth ? "transparent" : "var(--surface-2,#fafbfc)",
                    opacity: c.inMonth ? 1 : 0.5,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: isToday ? 800 : 500,
                      color: isToday ? "#fff" : weekday === 0 ? "#ef4444" : weekday === 6 ? "#3b82f6" : "var(--ink)",
                      background: isToday ? "var(--accent,#6366f1)" : "transparent",
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 0 2px auto",
                    }}
                  >
                    {c.day}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    {evs.slice(0, 3).map((e, i) => (
                      <button
                        key={i}
                        onClick={() => router.push(e.link)}
                        title={e.title}
                        style={{
                          textAlign: "left",
                          border: "none",
                          borderRadius: 4,
                          padding: "1px 4px",
                          cursor: "pointer",
                          fontSize: 10.5,
                          lineHeight: 1.3,
                          background: `${KIND_COLOR[e.kind]}20`,
                          color: KIND_COLOR[e.kind],
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          minWidth: 0,
                          maxWidth: "100%",
                          display: "block",
                        }}
                      >
                        {e.title}
                      </button>
                    ))}
                    {evs.length > 3 && <span className="muted" style={{ fontSize: 10 }}>+{evs.length - 3}건</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {monthEvents.length === 0 ? (
            <div className="empty">이번 달 일정이 없습니다.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {monthEvents.map((e, i) => (
                <button
                  key={i}
                  onClick={() => router.push(e.link)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    border: "none",
                    borderBottom: "1px solid var(--border,#eef0f2)",
                    background: e.date === today ? "var(--accent-bg,#eef2ff)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, minWidth: 44, color: e.date < today ? "var(--ink-2)" : "var(--ink)" }}>
                    {e.date.slice(5).replace("-", "/")}
                  </span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: KIND_COLOR[e.kind], flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13.5 }}>{e.title}</span>
                  {e.sub && <span className="muted" style={{ fontSize: 11.5 }}>{e.sub}</span>}
                  <span className="badge" style={{ fontSize: 10.5 }}>{KIND_LABEL[e.kind]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
