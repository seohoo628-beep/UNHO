// 업무투두 상단 요약(오늘 업무·이번 주 업무) 계산. 순수 함수라 테스트한다.
import { addDays, weekStart } from "@/lib/agentRoutines";
import type { SummaryItem, TodoSummaryData } from "@/components/TodoSummary";

export type SummaryRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
  note: string | null;
  brandName: string | null;
  names: string[]; // 담당자 이름
};

const OPEN = new Set(["예정", "진행"]);
const PRIO: Record<string, number> = { 높음: 0, 보통: 1, 낮음: 2 };
const WD = ["월", "화", "수", "목", "금", "토", "일"];

/** timestamptz → 서울 날짜(YYYY-MM-DD) */
export function seoulDateOf(ts: string | null): string | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  if (isNaN(t)) return null;
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function buildTodoSummary(rows: SummaryRow[], today: string, aiNames: Set<string>): TodoSummaryData {
  const ws = weekStart(today);
  const we = addDays(ws, 6);
  const isAi = (r: SummaryRow) => r.names.some((n) => aiNames.has(n)) || !!r.note?.startsWith("[AI 정기업무");
  const toItem = (r: SummaryRow): SummaryItem => ({
    id: r.id,
    title: r.title,
    who: r.names.length ? r.names.join(", ") : "미지정",
    brand: r.brandName,
    priority: r.priority,
    due: r.due_date,
    overdue: !!r.due_date && r.due_date < today,
    ai: isAi(r),
  });
  const byPrio = (a: SummaryRow, b: SummaryRow) =>
    (a.due_date ?? "").localeCompare(b.due_date ?? "") || (PRIO[a.priority] ?? 1) - (PRIO[b.priority] ?? 1);

  // AI 직원 업무는 'AI 결과 검토' 숫자로만 보이고, 나머지 집계·목록은 사람 업무만.
  const aiReview = rows.filter((r) => isAi(r) && r.status === "진행" && r.note?.startsWith("[AI 정기업무 결과")).length;
  const human = rows.filter((r) => !isAi(r));
  const open = human.filter((r) => OPEN.has(r.status));
  const done = human.filter((r) => r.status === "완료");

  const overdue = open.filter((r) => r.due_date && r.due_date < today);
  const dueToday = open.filter((r) => r.due_date === today);
  const todayItems = [...overdue.sort(byPrio), ...dueToday.sort(byPrio)].map(toItem);

  const doneDate = (r: SummaryRow) => seoulDateOf(r.completed_at);
  const doneToday = done.filter((r) => doneDate(r) === today).length;

  const inWeek = (d: string | null) => !!d && d >= ws && d <= we;
  const weekOpen = open.filter((r) => inWeek(r.due_date));
  const weekDone = done.filter((r) => inWeek(doneDate(r)) || (inWeek(r.due_date) && !doneDate(r)));
  const weekItems = open.filter((r) => r.due_date && r.due_date > today && r.due_date <= we).sort(byPrio).map(toItem);

  const byDay = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(ws, i);
    return {
      date,
      label: WD[i],
      open: weekOpen.filter((r) => r.due_date === date).length,
      done: weekDone.filter((r) => (doneDate(r) ?? r.due_date) === date).length,
    };
  });

  const person = new Map<string, number>();
  for (const r of weekOpen) for (const n of r.names.length ? r.names : ["미지정"]) person.set(n, (person.get(n) ?? 0) + 1);
  const byPerson = [...person.entries()].map(([name, n]) => ({ name, open: n })).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  return {
    today,
    weekStart: ws,
    weekEnd: we,
    todayItems,
    overdueCount: overdue.length,
    dueTodayCount: dueToday.length,
    doneToday,
    aiReview,
    weekItems,
    weekDue: weekOpen.length,
    weekDone: weekDone.length,
    byDay,
    byPerson,
  };
}
