// 업무투두 최상단 요약: 오늘 업무 · 이번 주 업무.
// 서버에서 계산한 값만 받아 그린다(클라이언트 상태 없음).

export type SummaryItem = {
  id: string;
  title: string;
  who: string; // 담당자(쉼표 구분) 또는 "미지정"
  brand: string | null;
  priority: string;
  due: string | null; // YYYY-MM-DD
  overdue: boolean;
  ai: boolean; // AI 정기업무
};

export type TodoSummaryData = {
  today: string; // YYYY-MM-DD
  weekStart: string; // 월요일
  weekEnd: string; // 일요일
  todayItems: SummaryItem[]; // 지연 + 오늘 마감(미완료)
  overdueCount: number;
  dueTodayCount: number;
  doneToday: number;
  aiReview: number; // AI 결과 검토 대기(진행 상태)
  weekItems: SummaryItem[]; // 내일~일요일 마감(미완료)
  weekDue: number; // 이번 주 마감 미완료(오늘·지연 제외 남은 것 포함 전체)
  weekDone: number; // 이번 주 완료
  byDay: { date: string; label: string; open: number; done: number }[]; // 월~일
  byPerson: { name: string; open: number }[]; // 이번 주 마감 미완료 담당자별
};

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const wdOf = (d: string) => WD[new Date(`${d}T00:00:00Z`).getUTCDay()];

function Stat({ n, label, tone }: { n: number; label: string; tone?: "warn" | "owner" | "ok" | "accent" }) {
  const color = tone === "owner" ? "var(--owner)" : tone === "warn" ? "var(--warn)" : tone === "ok" ? "var(--ok)" : tone === "accent" ? "var(--accent)" : "var(--ink)";
  return (
    <div style={{ minWidth: 64 }}>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, color, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ItemList({ items, empty, showDay }: { items: SummaryItem[]; empty: string; showDay?: boolean }) {
  if (items.length === 0) return <div className="muted" style={{ fontSize: 12.5, padding: "6px 0" }}>{empty}</div>;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {items.map((t) => (
        <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, lineHeight: 1.4 }}>
          <span style={{ flexShrink: 0, minWidth: 44, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: t.overdue ? "var(--owner)" : "var(--muted, #6b7280)" }}>
            {t.overdue ? "지연" : showDay && t.due ? `${md(t.due)}(${wdOf(t.due)})` : "오늘"}
          </span>
          <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>
            {t.priority === "높음" && <span className="badge owner" style={{ marginRight: 5 }}>높음</span>}
            {t.ai && <span className="badge accent" style={{ marginRight: 5 }}>AI</span>}
            {t.title}
            <span className="muted" style={{ fontSize: 11.5 }}> · {t.who}{t.brand ? ` · ${t.brand}` : ""}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TodoSummary({ d }: { d: TodoSummaryData }) {
  const maxDay = Math.max(1, ...d.byDay.map((x) => x.open + x.done));
  const LIMIT = 8;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 16 }}>
      {/* 오늘 업무 */}
      <div className="card" style={{ margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>오늘 업무</div>
          <div className="muted" style={{ fontSize: 12 }}>{md(d.today)}({wdOf(d.today)})</div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
          <Stat n={d.dueTodayCount} label="오늘 마감" tone="accent" />
          <Stat n={d.overdueCount} label="지연" tone={d.overdueCount ? "owner" : undefined} />
          <Stat n={d.doneToday} label="오늘 완료" tone="ok" />
          <a href="/agent-routines#review" style={{ textDecoration: "none", color: "inherit" }}><Stat n={d.aiReview} label="AI 결과 검토 ›" tone={d.aiReview ? "warn" : undefined} /></a>
        </div>
        <ItemList items={d.todayItems.slice(0, LIMIT)} empty="오늘 마감이거나 지연된 업무가 없습니다." />
        {d.todayItems.length > LIMIT && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>외 {d.todayItems.length - LIMIT}건은 아래 목록에서 확인</div>}
      </div>

      {/* 이번 주 업무 */}
      <div className="card" style={{ margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>이번 주 업무</div>
          <div className="muted" style={{ fontSize: 12 }}>{md(d.weekStart)}~{md(d.weekEnd)}</div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
          <Stat n={d.weekDue} label="이번 주 마감 남음" tone="accent" />
          <Stat n={d.weekDone} label="이번 주 완료" tone="ok" />
          <Stat n={d.weekDue + d.weekDone ? Math.round((d.weekDone / (d.weekDue + d.weekDone)) * 100) : 0} label="완료율 %" />
        </div>
        {/* 요일별 마감: 진한 막대 = 남음, 옅은 막대 = 완료 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, alignItems: "end", height: 70, marginBottom: 4 }}>
          {d.byDay.map((x) => {
            const isToday = x.date === d.today;
            return (
              <div key={x.date} title={`${x.label} 남음 ${x.open} · 완료 ${x.done}`} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                <div style={{ fontSize: 10.5, textAlign: "center", fontWeight: 700, marginBottom: 2 }}>{x.open || ""}</div>
                <div style={{ height: `${(x.open / maxDay) * 46}px`, background: "var(--accent)", borderRadius: "3px 3px 0 0", opacity: isToday ? 1 : 0.75 }} />
                <div style={{ height: `${(x.done / maxDay) * 46}px`, background: "var(--ok)", opacity: 0.35 }} />
                <div style={{ height: 2, background: "var(--line)" }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 12 }}>
          {d.byDay.map((x) => (
            <div key={x.date} style={{ fontSize: 11, textAlign: "center", fontWeight: x.date === d.today ? 800 : 400, color: x.date === d.today ? "var(--accent)" : undefined }}>{x.label}</div>
          ))}
        </div>
        {d.byPerson.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {d.byPerson.slice(0, 8).map((p) => (
              <span key={p.name} className="badge" style={{ fontSize: 11.5 }}>{p.name} {p.open}</span>
            ))}
          </div>
        )}
        <ItemList items={d.weekItems.slice(0, LIMIT)} empty="내일부터 이번 주 말까지 마감인 업무가 없습니다." showDay />
        {d.weekItems.length > LIMIT && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>외 {d.weekItems.length - LIMIT}건</div>}
      </div>
    </div>
  );
}
