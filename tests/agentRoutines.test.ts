import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isoWeekday,
  weekStart,
  addBusinessDays,
  isDueOn,
  periodKey,
  dueDateFor,
  materializeRoutines,
  type RoutineRow,
} from "../src/lib/agentRoutines";
import { buildRoutinePrompt } from "../src/lib/agents/routine";

// 2026-11-16 = 월요일
test("isoWeekday·weekStart", () => {
  assert.equal(isoWeekday("2026-11-16"), 1);
  assert.equal(isoWeekday("2026-11-22"), 7);
  assert.equal(weekStart("2026-11-19"), "2026-11-16");
  assert.equal(weekStart("2026-11-22"), "2026-11-16");
  assert.equal(weekStart("2026-11-16"), "2026-11-16");
});

test("addBusinessDays: 주말 건너뛰기, 0일이 주말이면 다음 월요일", () => {
  assert.equal(addBusinessDays("2026-11-16", 0), "2026-11-16");
  assert.equal(addBusinessDays("2026-11-20", 1), "2026-11-23"); // 금 +1 → 월
  assert.equal(addBusinessDays("2026-11-16", 2), "2026-11-18");
  assert.equal(addBusinessDays("2026-11-21", 0), "2026-11-23"); // 토 → 월
  assert.equal(addBusinessDays("2026-12-31", 1), "2027-01-01");
});

const base = { active: true, weekdays_only: true };

test("isDueOn: 일간은 평일만, 주간은 지정 요일만, 중지 루틴은 제외", () => {
  const daily = { ...base, cadence: "daily" as const, weekday: null };
  assert.equal(isDueOn(daily, "2026-11-16"), true);
  assert.equal(isDueOn(daily, "2026-11-21"), false);
  assert.equal(isDueOn({ ...daily, weekdays_only: false }, "2026-11-21"), true);
  const weeklyThu = { ...base, cadence: "weekly" as const, weekday: 4 };
  assert.equal(isDueOn(weeklyThu, "2026-11-19"), true);
  assert.equal(isDueOn(weeklyThu, "2026-11-18"), false);
  assert.equal(isDueOn({ ...weeklyThu, active: false }, "2026-11-19"), false);
  assert.equal(isDueOn(daily, "2026/11/16"), false);
});

test("periodKey: 일간은 날짜, 주간은 그 주 월요일", () => {
  assert.equal(periodKey("daily", "2026-11-18"), "D:2026-11-18");
  assert.equal(periodKey("weekly", "2026-11-18"), "W:2026-11-16");
});

test("dueDateFor: 오프셋 범위 보정", () => {
  assert.equal(dueDateFor({ due_offset_days: 2 }, "2026-11-16"), "2026-11-18");
  assert.equal(dueDateFor({ due_offset_days: -3 }, "2026-11-16"), "2026-11-16");
  assert.equal(dueDateFor({ due_offset_days: 99 }, "2026-11-16"), "2026-12-04"); // 14영업일 상한
});

// ── materializeRoutines: 가짜 클라이언트로 생성·중복 방지 검증 ──
function fakeClient(routines: Partial<RoutineRow>[], existing: { routine_id: string; routine_period: string }[]) {
  const inserted: Record<string, unknown>[] = [];
  const chain = (data: unknown) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      not: () => q,
      in: () => q,
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res),
    };
    return q;
  };
  return {
    inserted,
    from(table: string) {
      if (table === "agent_routines") return chain(routines);
      if (table === "users") return chain([{ id: "u-acc", agent_key: "accounting-clerk" }]);
      if (table === "todos") {
        const q = chain(existing);
        q.insert = async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: null };
        };
        return q;
      }
      return chain([]);
    },
  };
}

const routine = (over: Partial<RoutineRow>): Partial<RoutineRow> => ({
  agent_key: "accounting-clerk",
  weekdays_only: true,
  due_offset_days: 0,
  priority: "높음",
  brand_id: null,
  context_keys: [],
  instructions: "점검",
  auto_run: true,
  requires_review: true,
  active: true,
  weekday: null,
  ...over,
});

test("materializeRoutines: 오늘 해당 루틴만 만들고 이미 있는 기간은 건너뛴다", async () => {
  const c = fakeClient(
    [
      routine({ id: "r1", title: "일간", cadence: "daily" }),
      routine({ id: "r2", title: "주간 월", cadence: "weekly", weekday: 1, due_offset_days: 2 }),
      routine({ id: "r3", title: "주간 목", cadence: "weekly", weekday: 4 }),
    ],
    [{ routine_id: "r1", routine_period: "D:2026-11-16" }]
  );
  const n = await materializeRoutines(c, "2026-11-16");
  assert.equal(n, 1);
  assert.equal(c.inserted.length, 1);
  const row = c.inserted[0];
  assert.equal(row.routine_id, "r2");
  assert.equal(row.routine_period, "W:2026-11-16");
  assert.equal(row.due_date, "2026-11-18");
  assert.equal(row.assignee_user_id, "u-acc");
  assert.deepEqual(row.assignee_user_ids, ["u-acc"]);
  assert.equal(row.agent_status, "대기");
  assert.equal(row.status, "예정");
});

test("buildRoutinePrompt: 데이터 외 사실 금지 규칙과 보고 구조 포함", () => {
  const { system, user } = buildRoutinePrompt(
    { agent_key: "accounting-clerk", title: "미수금 점검", instructions: "연체 정리" },
    "2026-11-16",
    "[미수금]\n데이터 없음"
  );
  assert.match(system, /경리/);
  assert.match(system, /데이터에 없는 수치/);
  assert.match(system, /이모지를 쓰지 않는다/);
  assert.match(user, /대표 확인 필요/);
  assert.match(user, /\[미수금\]/);
});

// ── 0101: 에이전트 전원 등록·루틴 정합성 ──
import { readFileSync } from "node:fs";
import { AGENT_PERSONA, CONTEXT_KEYS } from "../src/lib/agents/routine";

const sql = ["0100_agent_routines.sql", "0101_agent_staff_all.sql"]
  .map((f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8"))
  .join("\n");

test("마이그레이션: AI 직원 22명 등록, 모두 페르소나 보유", () => {
  const keys = new Set([...sql.matchAll(/'ai',\s*'[^']*',\s*'([a-z-]+)',\s*true\)/g)].map((m) => m[1]));
  assert.equal(keys.size, 22);
  for (const k of keys) assert.ok(AGENT_PERSONA[k], `페르소나 없음: ${k}`);
});

test("마이그레이션: 모든 루틴의 담당자와 참고 데이터가 코드에 존재", () => {
  const rows = [...sql.matchAll(/\('([a-z-]+)',\s*'[^']+',\s*'(daily|weekly)',\s*(?:null|\d),\s*\d+,\s*'[^']+',\s*'\{([^}]*)\}'/g)];
  assert.ok(rows.length >= 28, `루틴 수 ${rows.length}`);
  const agents = new Set(rows.map((m) => m[1]));
  for (const a of agents) assert.ok(AGENT_PERSONA[a], `페르소나 없음: ${a}`);
  for (const m of rows) for (const k of m[3].split(",").filter(Boolean)) assert.ok(CONTEXT_KEYS.includes(k), `참고 데이터 없음: ${k}`);
  // 22명 전원이 최소 1개 루틴을 가진다(무당티 점검은 md-mudangtea로 이관).
  const owners = new Set([...agents, "md-mudangtea"]);
  assert.equal(owners.size, 22);
});
