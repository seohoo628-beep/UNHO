import { test } from "node:test";
import assert from "node:assert/strict";
import { supplyExVat, autoShipCost, cartons, saleCalc, totals, lotStock, daysUntil, expiryLevel, lastMonths, type MdtSettings, type MdtSale } from "../src/lib/mudangtea";

// 테스트용 값(실제 거래 조건과 무관)
const s: MdtSettings = { supplyPriceIncl: 1100, vatRate: 0.1, retailPrice: 3000, shipPerCarton: 500, boxesPerCarton: 10 };

test("공급가: VAT 포함 입력 → VAT 별도 환산", () => {
  assert.equal(Math.round(supplyExVat(s)!), 1000);
  assert.equal(supplyExVat(null), null);
  assert.equal(supplyExVat({ ...s, supplyPriceIncl: null }), null);
});

test("배송비: 카톤(1건)당, 올림", () => {
  assert.equal(autoShipCost(10, s), 500);
  assert.equal(autoShipCost(11, s), 1000);
  assert.equal(autoShipCost(0, s), null);
  assert.equal(cartons(21, s), 3);
  assert.equal(autoShipCost(5, { ...s, shipPerCarton: null }), null);
});

test("판매 1건 계산과 합계", () => {
  const a: MdtSale = { id: "a", saleDate: "2026-11-14", accountId: "x", lotId: "L1", qty: 10, unitPrice: 2000, shipCost: 500, note: "" };
  const b: MdtSale = { ...a, id: "b", qty: 5, shipCost: null, lotId: "" };
  assert.deepEqual(saleCalc(a, s), { revenue: 20000, cost: 10000, ship: 500, profit: 9500 });
  const t = totals([a, b], s);
  assert.equal(t.revenue, 30000); assert.equal(t.cost, 15000); assert.equal(t.ship, 500); assert.equal(t.profit, 14500); assert.equal(t.boxes, 15);
  assert.equal(saleCalc(a, null).cost, 0);
});

test("로트 재고 = 입고 − 그 로트 판매", () => {
  const sales = [{ id: "a", saleDate: "", accountId: "", lotId: "L1", qty: 7, unitPrice: 0, shipCost: 0, note: "" }, { id: "b", saleDate: "", accountId: "", lotId: "L2", qty: 3, unitPrice: 0, shipCost: 0, note: "" }];
  assert.equal(lotStock({ id: "L1", lotNo: "", receivedDate: "", expiry: "", qtyIn: 20, note: "" }, sales), 13);
});

test("유통기한 일수·등급, 최근 월", () => {
  assert.equal(daysUntil("2026-12-14", "2026-11-14"), 30);
  assert.equal(daysUntil("", "2026-11-14"), null);
  assert.equal(expiryLevel(-1), "past");
  assert.equal(expiryLevel(90), "urgent");
  assert.equal(expiryLevel(150), "watch");
  assert.equal(expiryLevel(400), "ok");
  assert.deepEqual(lastMonths("2026-02-10", 3), ["2025-12", "2026-01", "2026-02"]);
});
