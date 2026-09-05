import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExpenseMemo, resolveMonthDay } from "../src/lib/expenseParse";

test("기본: 이름 + 만원 단위 숫자, 괄호 날짜", () => {
  const r = parseExpenseMemo("도형 13만\n뷰티밤 중진공 300\n장효윤 약800 (10일)\n경남제약 3000(25일)");
  assert.equal(r.length, 4);
  assert.deepEqual([r[0].name, r[0].amount, r[0].day], ["도형", 130_000, null]);
  assert.deepEqual([r[1].name, r[1].amount], ["뷰티밤 중진공", 3_000_000]);
  assert.deepEqual([r[2].name, r[2].amount, r[2].day, r[2].memo], ["장효윤", 8_000_000, 10, "약 · 10일"]);
  assert.deepEqual([r[3].name, r[3].amount, r[3].day], ["경남제약", 30_000_000, 25]);
});

test("말일·10월이후·제목 줄 무시", () => {
  const r = parseExpenseMemo("9월 나갈곳\n신동 모델료 4400(말일까지)\n도형 1500(10월이후)");
  assert.equal(r.length, 2);
  assert.equal(r[0].lastDay, true);
  assert.equal(r[0].amount, 44_000_000);
  assert.equal(r[1].month, 10);
  assert.deepEqual(resolveMonthDay(r[0], "2026-09"), { month: "2026-09", dueDay: 30 });
  assert.deepEqual(resolveMonthDay(r[1], "2026-09"), { month: "2026-10", dueDay: 10 });
  assert.deepEqual(resolveMonthDay(r[1], "2026-11"), { month: "2027-10", dueDay: 10 });
});

test("줄 앞 날짜 + 쉼표 분리 + 접두어", () => {
  const r = parseExpenseMemo("10일 급여-신미집700, 대운1000,본사 800");
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => [x.name, x.amount, x.day]), [
    ["급여 - 신미집", 7_000_000, 10],
    ["급여 - 대운", 10_000_000, 10],
    ["급여 - 본사", 8_000_000, 10],
  ]);
});

test("매일 N만원씩 M회 → 곱셈", () => {
  const r = parseExpenseMemo("10일부터 박경배대표 매일 100만원씩 19회.");
  assert.equal(r.length, 1);
  assert.equal(r[0].name, "박경배대표");
  assert.equal(r[0].amount, 19_000_000);
  assert.equal(r[0].day, 10);
  assert.match(r[0].memo, /100만원씩 19회/);
});

test("단위 옵션: 원 단위 숫자, 명시 단위 우선", () => {
  const r = parseExpenseMemo("택배비 35,000\n광고비 2백만", { unit: "원" });
  assert.equal(r[0].amount, 35_000);
  assert.equal(r[1].amount, 2_000_000);
});
