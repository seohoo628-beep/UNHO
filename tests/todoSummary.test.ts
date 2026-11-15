import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTodoSummary, seoulDateOf, type SummaryRow } from "../src/lib/todoSummary";

const row = (o: Partial<SummaryRow>): SummaryRow => ({
  id: Math.random().toString(36).slice(2), title: "업무", status: "예정", priority: "보통",
  due_date: null, completed_at: null, note: null, brandName: null, names: ["김철수"], ...o,
});

// 2026-11-18 = 수요일, 그 주 11-16(월)~11-22(일)
test("오늘 업무: 지연·오늘 마감, 오늘 완료, AI 검토 대기", () => {
  const s = buildTodoSummary([
    row({ title: "지연", due_date: "2026-11-17", priority: "높음" }),
    row({ title: "오늘", due_date: "2026-11-18" }),
    row({ title: "내일", due_date: "2026-11-19" }),
    row({ title: "다음주", due_date: "2026-11-24" }),
    row({ title: "완료됨", status: "완료", due_date: "2026-11-18", completed_at: "2026-11-18T01:00:00Z" }),
    row({ title: "AI", status: "진행", due_date: "2026-11-18", names: ["AI 경리"], note: "[AI 정기업무 결과 · ...]" }),
    row({ title: "보류", status: "보류", due_date: "2026-11-18" }),
  ], "2026-11-18", new Set(["AI 경리"]));
  assert.equal(s.overdueCount, 1);
  assert.equal(s.dueTodayCount, 2);
  assert.deepEqual(s.todayItems.map((i) => i.title), ["지연", "오늘", "AI"]);
  assert.equal(s.todayItems[0].overdue, true);
  assert.equal(s.todayItems.find((i) => i.title === "AI")?.ai, true);
  assert.equal(s.doneToday, 1);
  assert.equal(s.aiReview, 1);
});

test("이번 주 업무: 월~일 범위, 내일 이후 목록, 요일·담당자 집계", () => {
  const s = buildTodoSummary([
    row({ due_date: "2026-11-16", names: ["A"] }),
    row({ title: "목", due_date: "2026-11-19", names: ["A", "B"] }),
    row({ title: "일", due_date: "2026-11-22", names: [] }),
    row({ due_date: "2026-11-23" }),
    row({ status: "완료", due_date: "2026-11-17", completed_at: "2026-11-17T23:30:00Z" }), // 서울 11-18 완료
  ], "2026-11-18", new Set());
  assert.equal(s.weekStart, "2026-11-16");
  assert.equal(s.weekEnd, "2026-11-22");
  assert.equal(s.weekDue, 3);
  assert.equal(s.weekDone, 1);
  assert.deepEqual(s.weekItems.map((i) => i.title), ["목", "일"]);
  assert.equal(s.weekItems[1].who, "미지정");
  assert.deepEqual(s.byDay.map((d) => d.open), [1, 0, 0, 1, 0, 0, 1]);
  assert.equal(s.byDay[2].done, 1);
  assert.deepEqual(s.byPerson[0], { name: "A", open: 2 });
});

test("seoulDateOf: UTC 15시 이후는 서울 다음 날", () => {
  assert.equal(seoulDateOf("2026-11-17T15:30:00Z"), "2026-11-18");
  assert.equal(seoulDateOf(null), null);
});
