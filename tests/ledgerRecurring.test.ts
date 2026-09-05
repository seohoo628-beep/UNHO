import { test } from "node:test";
import assert from "node:assert/strict";
import { daysInMonth, entryDateFor } from "../src/lib/ledgerRecurring";

test("daysInMonth: 윤년·30일·31일", () => {
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2028-02"), 29);
  assert.equal(daysInMonth("2026-04"), 30);
  assert.equal(daysInMonth("2026-12"), 31);
});

test("entryDateFor: 말일 초과는 말일로, 범위 밖은 보정", () => {
  assert.equal(entryDateFor("2026-02", 31), "2026-02-28");
  assert.equal(entryDateFor("2026-09", 15), "2026-09-15");
  assert.equal(entryDateFor("2026-09", 0), "2026-09-01");
  assert.equal(entryDateFor("2026-09", 5.4), "2026-09-05");
});
