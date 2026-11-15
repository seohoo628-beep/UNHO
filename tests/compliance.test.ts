import { test } from "node:test";
import assert from "node:assert/strict";
import { runComplianceCheck } from "../src/lib/compliance";
import type { Brand } from "../src/lib/types";

// 브랜드 마스터(0003_seed_brand_master.sql)의 규제 근거만 옮긴 테스트용 브랜드
function brand(slug: string, category: string, regulation: string): Brand {
  return { id: slug, slug, name: slug, category, regulation } as Brand;
}
const mdt = brand("mdt", "식품", "식품표시광고법");
const jd = brand("jd", "건강기능식품·식품", "건강기능식품법 / 식품표시광고법");
const ey = brand("ey", "화장품", "화장품법");

const rulesHit = (b: Brand, body: string) => runComplianceCheck(b, body).findings.map((f) => f.rule);
const phrases = (b: Brand, body: string) => runComplianceCheck(b, body).findings.map((f) => f.phrase);

test("무당티: '혈당 스파이크 타겟 필름'은 지적된다", () => {
  const r = runComplianceCheck(mdt, "혈당 스파이크 타겟 필름");
  assert.equal(r.verdict, "fail");
  assert.deepEqual(r.findings.map((f) => f.phrase), ["혈당 스파이크"]);
  assert.match(r.findings[0].rule, /혈당/);
  assert.ok(r.findings[0].suggestion.length > 0);
});

test("일반식품: 혈당 계열 표현 전부 지적, 가장 긴 문구로 1건씩", () => {
  const cases: [string, string][] = [
    ["매일 혈당케어", "혈당케어"],
    ["혈당 조절에 신경 쓰는 분", "혈당 조절"],
    ["혈당 관리 루틴", "혈당 관리"],
    ["식후 혈당이 걱정될 때", "식후 혈당"],
    ["혈당을 낮추는 차", "혈당을 낮"],
    ["혈당이 궁금하다면", "혈당"],
  ];
  for (const [body, phrase] of cases) {
    assert.equal(runComplianceCheck(mdt, body).verdict, "fail", body);
    assert.deepEqual(phrases(mdt, body), [phrase], body);
  }
  assert.ok(rulesHit(mdt, "당뇨가 있는 분께").some((r) => /혈당·당뇨/.test(r)));
});

test("일반식품: 혈당 표현이 없는 기술적 서술은 통과", () => {
  const r = runComplianceCheck(mdt, "바나바잎추출물 함유, 입에서 녹는 필름 10매. HACCP 인증 시설에서 만든다.");
  assert.equal(r.verdict, "pass");
  assert.deepEqual(r.findings, []);
});

test("건강기능식품 브랜드에는 일반식품 혈당 규칙을 걸지 않는다", () => {
  assert.ok(!rulesHit(jd, "식후 혈당").some((r) => /혈당·당뇨/.test(r)));
});

test("숙취 표현: 일반식품·건기식 모두 실증 필요로 지적", () => {
  for (const b of [mdt, jd]) {
    const r = runComplianceCheck(b, "숙취해소에 좋은 스틱");
    assert.equal(r.verdict, "fail", b.slug);
    const f = r.findings.find((x) => /숙취/.test(x.rule));
    assert.ok(f, b.slug);
    assert.equal(f!.phrase, "숙취해소");
    assert.match(f!.reason, /실증/);
  }
  assert.deepEqual(phrases(jd, "숙취 때문에 힘든 아침"), ["숙취"]);
});

test("숙취 표현 없이 상황으로 서술하면 통과", () => {
  assert.equal(runComplianceCheck(jd, "술자리 다음 날 아침에 챙기는 스틱").verdict, "pass");
});

test("화장품 브랜드에는 혈당·숙취 규칙이 걸리지 않는다", () => {
  assert.deepEqual(rulesHit(ey, "혈당 숙취"), []);
});
