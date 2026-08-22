import { test } from "node:test";
import assert from "node:assert/strict";
import { checklistOrd, normalizeChecklist, normDue, type ChecklistItem } from "../src/components/Checklist";
import { mergeForDay, showsOn, customKey, CHECKLIST, CEO_CHECKLIST } from "../src/lib/dailyChecklist";

const it = (p: Partial<ChecklistItem> & { id: string }): ChecklistItem => ({ text: p.id, done: false, ...p });

test("체크리스트 정렬: 완료 맨아래 → 고정 최상단 → 마감 임박순 → 무마감 수동순", () => {
  const items = [
    it({ id: "e", done: true }),
    it({ id: "d" }),                       // 무마감
    it({ id: "c", due: "2026-09-01" }),
    it({ id: "b", due: "2026-08-25" }),    // 더 임박
    it({ id: "a", pinned: true }),         // 고정
  ];
  const sorted = [...items].sort(checklistOrd).map((x) => x.id);
  assert.deepEqual(sorted, ["a", "b", "c", "d", "e"]);
});

test("정렬 안정성: 무마감 항목끼리는 순서 유지(수동 정렬 보존)", () => {
  const items = [it({ id: "x" }), it({ id: "y" }), it({ id: "z" })];
  assert.deepEqual([...items].sort(checklistOrd).map((i) => i.id), ["x", "y", "z"]);
});

test("normDue: YYYY-MM-DD만 허용", () => {
  assert.equal(normDue("2026-08-22"), "2026-08-22");
  assert.equal(normDue("2026-8-2"), undefined);
  assert.equal(normDue(""), undefined);
  assert.equal(normDue(null), undefined);
});

test("normalizeChecklist: 빈 텍스트 제거, pinned·brand·due 보존", () => {
  const out = normalizeChecklist([
    { id: "1", text: "  유지  ", done: 1, pinned: true, brand: "뷰티밤", due: "2026-08-30" },
    { id: "2", text: "   " },              // 제거
    { id: "3", text: "무속성" },
    { id: "4", text: "잘못된 마감", due: "언젠가" },
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { id: "1", text: "유지", done: true, pinned: true, brand: "뷰티밤", due: "2026-08-30" });
  assert.equal(out[1].pinned, false);
  assert.equal(out[2].due, undefined);
});

test("showsOn: 요일 미지정=매일, 지정 시 해당 요일만", () => {
  const daily = { id: "a", group: "g", label: "l" };
  const monWed = { id: "b", group: "g", label: "l", weekdays: [1, 3] };
  assert.equal(showsOn(daily, 0), true);
  assert.equal(showsOn(monWed, 1), true);
  assert.equal(showsOn(monWed, 2), false);
});

test("mergeForDay: 기존 그룹에 합류·새 그룹 생성·요일 필터", () => {
  const base = [{ group: "운영", items: [{ key: "k1", label: "기본" }] }];
  const merged = mergeForDay(
    [
      { id: "c1", group: "운영", label: "내 항목" },
      { id: "c2", group: "새그룹", label: "새 그룹 항목" },
      { id: "c3", group: "운영", label: "월요일만", weekdays: [1] },
    ],
    2, // 화요일
    base
  );
  const 운영 = merged.find((g) => g.group === "운영")!;
  assert.deepEqual(운영.items.map((i) => i.key), ["k1", customKey("c1")]); // c3(월요일)은 제외
  assert.equal(merged.some((g) => g.group === "새그룹"), true);
});

test("CEO 체크리스트 키는 공용 키와 겹치지 않는다", () => {
  const staffKeys = new Set(CHECKLIST.flatMap((g) => g.items.map((i) => i.key)));
  for (const g of CEO_CHECKLIST) for (const i of g.items) {
    assert.equal(staffKeys.has(i.key), false, `${i.key} 충돌`);
    assert.ok(i.key.startsWith("ceo_"), `${i.key}는 ceo_ 접두사여야 함`);
  }
});
