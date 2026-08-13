import { test } from "node:test";
import assert from "node:assert/strict";
import { grantDays, computeLedger, completedMonths, tenureAtYearEnd } from "../src/lib/leave";

test("입사 당해년도: 개근 월수만큼 부여(첫해 최대 11)", () => {
  assert.equal(completedMonths("2026-03-01", "2026-12-31"), 9);
  assert.equal(grantDays("2026-03-01", 2026, "2026-12-31").granted, 9);
  assert.equal(grantDays("2026-01-01", 2026, "2026-12-31").granted, 11); // 첫해 상한
});

test("전년 중도입사 → 비례연차", () => {
  const g = grantDays("2025-07-01", 2026, "2026-12-31");
  assert.equal(g.kind, "비례연차(전년 입사)");
  assert.equal(g.granted, 8); // ceil(15 * 184/365)
});

test("1/1 입사자는 다음 해 15일", () => {
  assert.equal(grantDays("2025-01-01", 2026, "2026-12-31").granted, 15);
});

test("근속가산: 6년차 17일, 상한 25일", () => {
  assert.equal(tenureAtYearEnd("2020-01-01", 2026), 6);
  assert.equal(grantDays("2020-01-01", 2026, "2026-12-31").granted, 17); // 15 + floor(5/2)=2
  assert.equal(grantDays("2000-01-01", 2030, "2030-12-31").granted, 25); // 상한
});

test("입사 전 연도는 0", () => {
  assert.equal(grantDays("2026-01-01", 2025, "2025-12-31").granted, 0);
});

test("computeLedger: 월별 사용·반차·잔여", () => {
  const members = [{ id: "a", name: "홍길동", join_date: "2020-01-01", carryover: 2, note: null }];
  const usages = [
    { id: "1", member_id: "a", use_date: "2026-03-10", type: "연차" },
    { id: "2", member_id: "a", use_date: "2026-03-11", type: "반차(오전)" },
    { id: "3", member_id: "a", use_date: "2026-05-02", type: "연차" },
    { id: "4", member_id: "b", use_date: "2026-05-02", type: "연차" }, // 다른 사람 → 무시
    { id: "5", member_id: "a", use_date: "2025-05-02", type: "연차" }, // 다른 연도 → 무시
  ];
  const [row] = computeLedger(members, usages, 2026, "2026-12-31");
  assert.equal(row.granted, 17);
  assert.equal(row.held, 19); // 17 + 이월 2
  assert.equal(row.monthly[2], 1.5); // 3월 = 연차1 + 반차0.5
  assert.equal(row.monthly[4], 1); // 5월
  assert.equal(row.used, 2.5);
  assert.equal(row.remaining, 16.5);
});
