import { test } from "node:test";
import assert from "node:assert/strict";
import { vatOf, supplyOf, monthRange, toInputRows, toCsv, type LedgerRow } from "../src/lib/taxInvoice";

test("부가세: 과세 10% 원 단위 절사, 영세·면세 0", () => {
  assert.equal(vatOf(1_000_000), 100_000);
  assert.equal(vatOf(12_345), 1_234);
  assert.equal(vatOf(12_345, "영세"), 0);
  assert.equal(vatOf(12_345, "면세"), 0);
  assert.equal(vatOf(-100), 0);
});

test("공급가액: 직접 입력 우선, 없으면 수량×단가", () => {
  assert.equal(supplyOf({ supplyAmount: 500_000, quantity: 10, unitPrice: 1_000 }), 500_000);
  assert.equal(supplyOf({ supplyAmount: null, quantity: 200, unitPrice: 8_000 }), 1_600_000);
  assert.equal(supplyOf({ supplyAmount: null, quantity: null, unitPrice: 8_000 }), null);
});

test("월 범위: 말일 계산(윤년 포함)", () => {
  assert.deepEqual(monthRange("2026-11"), { from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual(monthRange("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
  assert.throws(() => monthRange("2026-13"));
});

const vendor = {
  name: "㈜테스트유통", business_no: "715-87-03094", ceo: "홍길동", address: "서울",
  biz_type: "도소매", biz_item: "화장품", tax_email: "tax@test.co.kr", email: null,
};
const base: LedgerRow = {
  id: "r1", counterparty: "테스트유통", item: "립밤 세트", supplier: "뷰티밤", supply_date: "2026-11-30",
  quantity: 200, unit_price: 8_000, supply_amount: null, tax_type: "과세", invoice_kind: "청구",
  invoice_no: null, note: null, vendors: vendor,
};

test("장부 → 입력 CSV: 발행 대상 변환, 발행 완료·면세 분리, 빈 정보 보고", () => {
  const { rows, exempt, gaps } = toInputRows([
    base,
    { ...base, id: "r2", invoice_no: "20261130-1234" },           // 이미 발행 → 제외
    { ...base, id: "r3", tax_type: "면세" },                        // 면세 → 따로
    { ...base, id: "r4", supplier: null, vendors: null, quantity: null }, // 정보 부족
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].공급가액, "1600000");
  assert.equal(rows[0].세액, "160000");
  assert.equal(rows[0].공급받는자_상호, "㈜테스트유통");
  assert.equal(rows[0].비고, "receivable:r1");
  assert.deepEqual(exempt.map((r) => r.id), ["r3"]);
  assert.equal(gaps.length, 1);
  assert.deepEqual(gaps[0].missing, ["공급자 법인", "매출처 연결", "공급가액"]);
});

test("CSV: BOM·헤더·따옴표 이스케이프", () => {
  const { rows } = toInputRows([{ ...base, item: '세트 "A", 200개' }]);
  const csv = toCsv(rows);
  assert.ok(csv.startsWith("﻿공급자,작성일자"));
  assert.ok(csv.includes('"세트 ""A"", 200개"'));
});
