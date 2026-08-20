import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitize, describe, friendlyError, FIELD_LABELS, ROW_COLS, EDIT_TOOL, SYSTEM } from "../src/lib/planAssistant";

/**
 * 어시스턴트 제안 검증 테스트.
 *
 * 어시스턴트는 화면 칸을 직접 고치지 않지만, 제안 목록이 화면에 그대로 뜨는 이상
 * 허용 목록 밖의 id 가 섞이면 사람이 무심코 눌러 엉뚱한 칸을 바꾼다. 여기서 턴다.
 */

test("허용 목록에 없는 칸은 버린다", () => {
  const { fields } = sanitize({
    fields: [
      { id: "pPrice", value: "39000", why: "경쟁 평균 상단" },
      { id: "pBrand", value: "misthefeel" }, // 브랜드 선택은 규제 기준까지 바꾸므로 채팅으로 못 건드린다
      { id: "__proto__", value: "x" },
      { id: "hDoc", value: "UNHO2026.0101.0001" }, // 문서번호는 저장이 발번한다
    ],
  });
  assert.deepEqual(fields.map((f) => f.id), ["pPrice"]);
  assert.equal(fields[0].label, "판가");
  assert.equal(fields[0].value, "39000");
});

test("표 제안은 열 키와 행 번호를 검사한다", () => {
  const { rows } = sanitize({
    rows: [
      { index: 3, col: "pr", value: "25900", why: "11번가 판매가" },
      { index: 0, col: "pr", value: "100" }, // 행 번호는 1부터
      { index: 2, col: "link", value: "https://evil.example" }, // 링크 열은 검색 결과만 채운다
      { index: 4, col: "s", value: "210" },
    ],
  });
  assert.deepEqual(
    rows.map((r) => [r.index, r.col]),
    [
      [3, "pr"],
      [4, "s"],
    ]
  );
  assert.equal(rows[0].label, "판매가");
});

test("제안이 없거나 형식이 깨져도 빈 배열로 떨어진다", () => {
  assert.deepEqual(sanitize({}), { fields: [], rows: [] });
  assert.deepEqual(sanitize({ fields: "nope", rows: 3 }), { fields: [], rows: [] });
  // 값이 빠진 제안은 "비우라"는 뜻으로 오해될 수 있어 버린다.
  assert.deepEqual(sanitize({ fields: [{ id: "pPrice" }] }).fields, []);
});

test("한 번에 밀어 넣는 양을 제한한다", () => {
  const many = Array.from({ length: 40 }, () => ({ id: "pPrice", value: "1" }));
  const rows = Array.from({ length: 40 }, (_, i) => ({ index: i + 1, col: "s", value: "1" }));
  const out = sanitize({ fields: many, rows });
  assert.equal(out.fields.length, 12);
  assert.equal(out.rows.length, 20);
});

test("상태 요약에 채운 칸·빈 칸·표가 모두 들어간다", () => {
  const txt = describe({
    fields: { pName: "주당의비결 스틱 20포", pPrice: "29900", pSpec: "" },
    product: { index: 1, count: 2, name: "주당의비결 스틱 20포" },
    summary: { 월매출: 5439000 },
    rows: [{ i: 1, p: "상쾌환 부스터", k: "숙취해소제", v: 18400, pr: 25900, r: 120 }],
  });
  assert.match(txt, /판가 \(pPrice\): 29900/);
  assert.match(txt, /스펙\(pSpec\)/); // 빈 칸 목록에 있어야 다음 질문으로 이어진다
  assert.match(txt, /상쾌환 부스터/);
  assert.match(txt, /월매출/);
});

test("빈 상태여도 요약을 만든다", () => {
  const txt = describe(undefined);
  assert.match(txt, /아직 없음/);
  assert.match(txt, /비어 있음/);
});

test("도구 스키마와 안내문이 같은 허용 목록을 가리킨다", () => {
  // 안내문에 없는 id 를 모델이 알 리 없고, 안내문에만 있는 id 는 sanitize 가 버린다.
  Object.keys(FIELD_LABELS).forEach((id) => assert.match(SYSTEM, new RegExp(`\\b${id}:`)));
  Object.keys(ROW_COLS).forEach((c) => assert.match(SYSTEM, new RegExp(`\\b${c}: `)));
  assert.equal(EDIT_TOOL.name, "plan_edit");
  assert.deepEqual(EDIT_TOOL.input_schema.required, ["reply"]);
});

test("크레딧·키 오류는 원문 JSON 대신 할 일을 알려준다", () => {
  // SDK 는 400 응답 본문을 message 에 그대로 담아 던진다. 그게 화면에 뜨면
  // 대표가 무엇을 해야 하는지 알 수 없다.
  const credit = friendlyError(
    new Error(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'
    )
  );
  assert.match(credit.message, /크레딧이 떨어져/);
  assert.match(credit.message, /Plans & Billing/);
  assert.doesNotMatch(credit.message, /invalid_request_error/);
  assert.equal(credit.code, 412);

  const auth = friendlyError(Object.assign(new Error("401 authentication_error"), { status: 401 }));
  assert.match(auth.message, /키가 유효하지 않습니다/);
  assert.equal(auth.code, 412);

  const rate = friendlyError(Object.assign(new Error("429 rate_limit_error"), { status: 429 }));
  assert.match(rate.message, /다시 보내/);
  assert.equal(rate.code, 429);

  // 키가 아예 없을 때의 안내는 이미 한국어라 그대로 통과시킨다.
  const nokey = friendlyError(new Error("ANTHROPIC API 키가 설정되지 않았습니다. 설정 화면에서…"));
  assert.match(nokey.message, /설정 화면/);
  assert.equal(nokey.code, 412);

  // 모르는 오류는 원문을 남겨야 다음에 무슨 일이었는지 알 수 있다.
  const odd = friendlyError(new Error("뭔가 새로운 오류"));
  assert.match(odd.message, /뭔가 새로운 오류/);
  assert.equal(odd.code, 502);
});
