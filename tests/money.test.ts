import { test } from "node:test";
import assert from "node:assert/strict";
import { outstandingReceivable, outstandingPayable, incentivePay } from "../src/lib/money";

test("미수금 잔액: 청구-수금 양수 합, 과수금은 0 처리", () => {
  assert.equal(
    outstandingReceivable([
      { billed: 1_000_000, received: 300_000 }, // 700,000
      { billed: 500_000, received: 500_000 },   // 0 (완납)
      { billed: 200_000, received: 250_000 },   // 0 (과수금 — 음수 금지)
      { billed: null, received: null },          // 0
    ]),
    700_000
  );
});

test("미지급 잔액: 금액-지급 양수 합", () => {
  assert.equal(
    outstandingPayable([
      { amount: 2_000_000, paid: 500_000 }, // 1,500,000
      { amount: 100_000, paid: null },      // 100,000
      { amount: null, paid: 50_000 },       // 0
    ]),
    1_600_000
  );
});

test("인센티브: (공구+프로모션) × 기준%, 반올림", () => {
  assert.deepEqual(incentivePay(10_000_000, 5_000_000, 5), { total: 15_000_000, pay: 750_000 });
  assert.deepEqual(incentivePay(0, 0, 5), { total: 0, pay: 0 });
  // 반올림 확인: 333,333 × 3% = 9,999.99 → 10,000
  assert.equal(incentivePay(333_333, 0, 3).pay, 10_000);
  // 비정상 입력은 0으로.
  assert.equal(incentivePay(Number.NaN, 0, 5).pay, 0);
});
