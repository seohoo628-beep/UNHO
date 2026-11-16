import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaxinvoice, mgtKeyOf, digits } from "../src/lib/popbillInvoice";

const seller = { corpNum: "715-87-03094", corpName: "㈜운호컴퍼니", ceo: "최운호", address: "서울 강남구", bizType: "도소매", bizItem: "건강기능식품", contact: null, email: "uc@x.net" };
const buyer = { corpNum: "123-45-67890", corpName: "마티뇽", ceo: "홍길동", address: "서울", bizType: "서비스", bizItem: "광고", email: "a@b.c" };
const src = { id: "8f1c2d3e-aaaa-bbbb-cccc-1234567890ab", item: "마케팅 대행", supplyDate: "2026-11-14", quantity: null, unitPrice: null, supplyAmount: 5000000, taxType: "과세", invoiceKind: "청구", note: null };

test("mgtKeyOf: 24자 이내·영숫자·테스트 구분", () => {
  const k = mgtKeyOf(src.id, false);
  assert.ok(k.length <= 24 && /^[A-Za-z0-9-]+$/.test(k));
  assert.notEqual(k, mgtKeyOf(src.id, true));
  assert.equal(k, mgtKeyOf(src.id, false));
});

test("buildTaxinvoice: 과세 10% 절사, 하이픈 제거, 청구, 합계", () => {
  const r = buildTaxinvoice(src, seller, buyer, "R-x", "2026-11-16");
  assert.ok(r.ok);
  if (!r.ok) return;
  const i = r.invoice as any;
  assert.equal(i.writeDate, "20261114");
  assert.equal(i.invoicerCorpNum, "7158703094");
  assert.equal(i.invoiceeCorpNum, "1234567890");
  assert.equal(i.supplyCostTotal, "5000000");
  assert.equal(i.taxTotal, "500000");
  assert.equal(i.totalAmount, "5500000");
  assert.equal(i.purposeType, "청구");
  assert.equal(i.invoicerContactName, "최운호");
  assert.equal(r.total, 5500000);
  assert.equal(i.detailList[0].tax, "500000");
});

test("buildTaxinvoice: 수량×단가, 영세 0원, 누락 항목 안내", () => {
  const r = buildTaxinvoice({ ...src, supplyAmount: null, quantity: 3, unitPrice: 33333, taxType: "영세" }, seller, buyer, "R-x", "2026-11-16");
  assert.ok(r.ok && (r.invoice as any).supplyCostTotal === "99999" && (r.invoice as any).taxTotal === "0");
  const bad = buildTaxinvoice({ ...src, supplyAmount: null }, { ...seller, bizType: null }, { ...buyer, corpNum: "12-3" }, "R-x", "2026-11-16");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(bad.missing, ["공급자 업태", "매출처 사업자번호", "공급가액(또는 수량·단가)"]);
  assert.equal(digits("715-87-03094"), "7158703094");
});
