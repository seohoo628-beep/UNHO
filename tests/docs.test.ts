import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeItems, totalsOf, nextDocNo, invoiceDeadline, contractState } from "../src/lib/docs";

test("normalizeItems·totalsOf: 수량×단가, 직접 공급가, 빈 줄 제거, 세액 절사", () => {
  const items = normalizeItems([
    { name: "주당의비결 정제", qty: "10", unit_price: "33,000" },
    { name: "배송비", supply: 3500 },
    { name: "  ", qty: 1, unit_price: 100 },
    { name: "샘플", qty: 3, unit_price: 3333 },
  ], "과세");
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => [i.supply, i.tax]), [[330000, 33000], [3500, 350], [9999, 999]]);
  assert.deepEqual(totalsOf(items), { supply: 343499, tax: 34349, total: 377848 });
  assert.equal(normalizeItems([{ name: "a", supply: 1000 }], "영세")[0].tax, 0);
});

test("nextDocNo·invoiceDeadline", () => {
  assert.equal(nextDocNo("2026-11-16", []), "TS-20261116-001");
  assert.equal(nextDocNo("2026-11-16", ["TS-20261116-001", "TS-20261116-007", "TS-20261115-009"]), "TS-20261116-008");
  assert.equal(invoiceDeadline("2026-11-14"), "2026-12-10");
  assert.equal(invoiceDeadline("2026-12-31"), "2027-01-10");
});

test("contractState", () => {
  const t = "2026-11-16";
  assert.equal(contractState({ status: "체결", end_date: "2026-12-01", notice_days: 30 }, t).label, "만료 D-15");
  assert.equal(contractState({ status: "체결", end_date: "2027-06-01" }, t).tone, "ok");
  assert.match(contractState({ status: "체결", end_date: "2026-11-01", auto_renew: true }, t).label, /자동갱신 확인/);
  assert.equal(contractState({ status: "해지", end_date: null }, t).label, "해지");
  assert.equal(contractState({ status: "체결", end_date: null }, t).label, "체결 · 기한 없음");
});
