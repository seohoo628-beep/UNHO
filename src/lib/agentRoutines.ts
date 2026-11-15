// AI 에이전트 정기 업무(루틴) — 일정 계산과 투두 생성.
// 크론·관리 화면에서 호출한다. (routine_id, routine_period) 유니크라 여러 번 호출해도 같은 날 중복 생성되지 않는다.

type Client = {
  from: (table: string) => any;
};

export type Cadence = "daily" | "weekly";

export type RoutineRow = {
  id: string;
  agent_key: string;
  title: string;
  cadence: Cadence;
  weekday: number | null; // 1=월 … 7=일
  weekdays_only: boolean;
  due_offset_days: number;
  priority: string;
  brand_id: string | null;
  context_keys: string[] | null;
  instructions: string;
  auto_run: boolean;
  requires_review: boolean;
  active: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toUTC(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO 요일: 1=월 … 7=일 */
export function isoWeekday(date: string): number {
  const w = toUTC(date).getUTCDay();
  return w === 0 ? 7 : w;
}

export function addDays(date: string, n: number): string {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** 그 주 월요일 */
export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** 영업일(월~금) 기준으로 n일 뒤. n=0이고 주말이면 다음 월요일. */
export function addBusinessDays(date: string, n: number): string {
  let d = date;
  while (isoWeekday(d) > 5) d = addDays(d, 1);
  let left = Math.max(0, Math.round(n));
  while (left > 0) {
    d = addDays(d, 1);
    if (isoWeekday(d) <= 5) left -= 1;
  }
  return d;
}

/** 오늘 이 루틴의 업무를 만들어야 하는가 */
export function isDueOn(r: Pick<RoutineRow, "cadence" | "weekday" | "weekdays_only" | "active">, date: string): boolean {
  if (!r.active || !DATE_RE.test(date)) return false;
  const wd = isoWeekday(date);
  if (r.cadence === "daily") return r.weekdays_only ? wd <= 5 : true;
  if (r.cadence === "weekly") return (r.weekday ?? 1) === wd;
  return false;
}

/** 중복 방지 키: 일간은 날짜, 주간은 그 주 월요일 */
export function periodKey(cadence: Cadence, date: string): string {
  return cadence === "weekly" ? `W:${weekStart(date)}` : `D:${date}`;
}

export function dueDateFor(r: Pick<RoutineRow, "due_offset_days">, date: string): string {
  return addBusinessDays(date, Math.min(14, Math.max(0, r.due_offset_days || 0)));
}

export const isMissingRoutines = (err: { code?: string; message?: string } | null | undefined) =>
  !!err && (err.code === "42P01" || err.code === "42703" || /agent_routines|routine_id|routine_period|agent_key/.test(err.message ?? ""));

export const ROUTINE_SELECT =
  "id, agent_key, title, cadence, weekday, weekdays_only, due_offset_days, priority, brand_id, context_keys, instructions, auto_run, requires_review, active";

export const CADENCE_LABEL = (r: Pick<RoutineRow, "cadence" | "weekday" | "weekdays_only">) => {
  const WD = ["", "월", "화", "수", "목", "금", "토", "일"];
  if (r.cadence === "weekly") return `매주 ${WD[r.weekday ?? 1]}요일`;
  return r.weekdays_only ? "매일(평일)" : "매일";
};

/** agent_key → users.id */
export async function agentUserMap(client: Client): Promise<Map<string, string>> {
  const { data } = await client.from("users").select("id, agent_key").eq("role", "ai").not("agent_key", "is", null);
  return new Map(((data ?? []) as { id: string; agent_key: string }[]).map((u) => [u.agent_key, u.id]));
}

/**
 * 오늘 해당하는 루틴을 투두로 만든다.
 * @returns 생성 건수. 테이블 미적용이면 null.
 */
export async function materializeRoutines(client: Client, today: string, onlyRoutineId?: string): Promise<number | null> {
  if (!DATE_RE.test(today)) return 0;
  let q = client.from("agent_routines").select(ROUTINE_SELECT).eq("active", true);
  if (onlyRoutineId) q = q.eq("id", onlyRoutineId);
  const { data: routines, error } = await q;
  if (error) return isMissingRoutines(error) ? null : 0;

  // 수동 실행(onlyRoutineId)은 요일과 무관하게 오늘 기간으로 만든다.
  const list = ((routines ?? []) as RoutineRow[]).filter((r) => (onlyRoutineId ? true : isDueOn(r, today)));
  if (list.length === 0) return 0;

  const users = await agentUserMap(client);
  const periods = new Map(list.map((r) => [r.id, periodKey(r.cadence, today)] as const));

  const { data: existing, error: e2 } = await client
    .from("todos")
    .select("routine_id, routine_period")
    .in("routine_id", list.map((r) => r.id));
  if (e2) return isMissingRoutines(e2) ? null : 0;
  const have = new Set(((existing ?? []) as { routine_id: string; routine_period: string }[]).map((x) => `${x.routine_id}|${x.routine_period}`));

  const rows = list
    .filter((r) => !have.has(`${r.id}|${periods.get(r.id)}`))
    .map((r) => {
      const uid = users.get(r.agent_key) ?? null;
      return {
        title: r.title,
        brand_id: r.brand_id,
        assignee_user_id: uid,
        assignee_user_ids: uid ? [uid] : [],
        priority: r.priority,
        due_date: dueDateFor(r, today),
        status: "예정",
        note: `[AI 정기업무 · ${CADENCE_LABEL(r)}] ${r.instructions}`,
        created_by: uid,
        routine_id: r.id,
        routine_period: periods.get(r.id),
        agent_status: r.auto_run ? "대기" : null,
      };
    });
  if (rows.length === 0) return 0;

  // 동시 실행으로 유니크 충돌이 나면 해당 행만 건너뛴다.
  let created = 0;
  for (const row of rows) {
    const { error: e3 } = await client.from("todos").insert(row);
    if (!e3) created += 1;
    else if (e3.code !== "23505") {
      if (isMissingRoutines(e3)) return null;
    }
  }
  return created;
}
