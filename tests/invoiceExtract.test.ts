import { test } from "node:test";
import assert from "node:assert/strict";
import { toBuyerFill, findVendor, formatBizNo } from "../src/lib/invoiceExtract";

test("toBuyerFill: 사업자등록증 값 정리(번호 형식, 업태·종목 첫 항목, 공백)", () => {
  const f = toBuyerFill({ name: " 주식회사  마티뇽 ", biz_no: "1234567890", ceo: "홍길동", address: "서울 강남구  압구정로 1", biz_type: "서비스, 도소매", biz_item: "광고대행\n전자상거래" });
  assert.deepEqual(f, { name: "주식회사 마티뇽", bizNo: "123-45-67890", ceo: "홍길동", address: "서울 강남구 압구정로 1", bizType: "서비스", bizItem: "광고대행", email: "" });
  assert.equal(formatBizNo("12-3"), "12-3");
});

test("findVendor: 사업자번호 우선, 없으면 상호(㈜·공백 무시)", () => {
  const vs = [{ id: "1", name: "마티뇽 서울", bizNo: "123-45-67890" }, { id: "2", name: "㈜한라산", bizNo: "" }];
  assert.equal(findVendor(vs, { name: "다른이름", bizNo: "1234567890" })?.id, "1");
  assert.equal(findVendor(vs, { name: "한라산", bizNo: "" })?.id, "2");
  assert.equal(findVendor(vs, { name: "새거래처", bizNo: "999-99-99999" }), null);
});
