import { test } from "node:test";
import assert from "node:assert/strict";
import { splitAction, matchAssignee, actionViews, confirmSectionEmpty, needsCeoReview, cleanPicks, defaultPicks, reportBody, WHOLE } from "../src/lib/agentDispatch";
import { buildRoutinePrompt, parseNextActions } from "../src/lib/agents/routine";

const staff = [
  { id: "u1", name: "최운호", job_title: "대표" },
  { id: "u2", name: "김경리", job_title: "경리" },
  { id: "u3", name: "박디자인", job_title: "디자이너" },
  { id: "u4", name: "이민수", job_title: "MD" },
];

test("splitAction: 항목 · 담당 · 기한", () => {
  assert.deepEqual(splitAction("A사 미수금 입금 독촉 연락 · 김경리 · 2026-11-20"), { task: "A사 미수금 입금 독촉 연락", who: "김경리", due: "2026-11-20" });
  assert.deepEqual(splitAction("상세페이지 수정 | 담당: 박디자인 | 기한 2026-11-21"), { task: "상세페이지 수정", who: "박디자인", due: "2026-11-21" });
  assert.deepEqual(splitAction("재고 확인"), { task: "재고 확인", who: null, due: null });
});

test("matchAssignee: 이름 우선, 직무 보조, 애매하면 null", () => {
  assert.equal(matchAssignee("김경리", staff), "u2");
  assert.equal(matchAssignee("경리 담당", staff), "u2");
  assert.equal(matchAssignee("디자이너", staff), "u3");
  assert.equal(matchAssignee("대표", staff), "u1");
  assert.equal(matchAssignee("AI MD", staff), null);
  assert.equal(matchAssignee("물류팀", staff), null);
  assert.equal(matchAssignee(null, staff), null);
});

test("actionViews: 완료·배정된 항목 제외, 추천 담당", () => {
  const list = [
    { id: "a", text: "입금 독촉 · 김경리 · 2026-11-20", done: false },
    { id: "b", text: "배너 교체 · 박디자인 · 2026-11-21", done: false, dispatched: "t9" },
    { id: "c", text: "발주 확인 · 물류 · 2026-11-22", done: true },
    { id: "d", text: "입점 제안서 · 이민수", done: false, due: "2026-11-25" },
  ];
  const v = actionViews(list, staff);
  assert.equal(v.length, 2);
  assert.deepEqual(v.map((x) => [x.idx, x.suggestId, x.due]), [[0, "u2", "2026-11-20"], [3, "u4", "2026-11-25"]]);
  assert.deepEqual(actionViews(null, staff), []);
});

const report = (confirm: string, actions: string) =>
  `1. 결론\n특이사항 없음\n2. 상세\n- 미수금 연체 0건\n3. 대표 확인 필요\n${confirm}\n4. 다음 액션\n${actions}`;

test("needsCeoReview: 확인 사항·다음 액션이 없으면 자동 완료", () => {
  const quiet = report("없음", "없음");
  assert.equal(confirmSectionEmpty(quiet), true);
  assert.equal(parseNextActions(quiet).length, 0);
  assert.equal(needsCeoReview(quiet, 0), false);

  const busy = report("- B사 결제 조건 변경 승인 필요", "- B사 회신 · 김경리 · 2026-11-20");
  assert.equal(confirmSectionEmpty(busy), false);
  assert.equal(needsCeoReview(busy, parseNextActions(busy).length), true);

  // 확인 사항은 없어도 사람이 할 액션이 있으면 검토
  assert.equal(needsCeoReview(report("없음", "- 회신 · 김경리 · 2026-11-20"), 1), true);
  // 형식을 지키지 않은 보고서는 사람이 본다
  assert.equal(needsCeoReview("결론만 있는 보고서", 0), true);
});

test("cleanPicks: 담당 검증·중복 제거·날짜 검증", () => {
  const valid = new Set(["u1", "u2"]);
  const out = cleanPicks(
    [
      { idx: 0, title: " 입금 독촉 ", assigneeId: "u2", due: "2026-11-20" },
      { idx: 0, title: "중복", assigneeId: "u2", due: null },
      { idx: 1, title: "외부인", assigneeId: "x", due: null },
      { idx: 2, title: "", assigneeId: "u1", due: null },
      { idx: 3, title: "보고", assigneeId: "u1", due: "11/20" },
    ],
    valid
  );
  assert.deepEqual(out, [
    { idx: 0, title: "입금 독촉", assigneeId: "u2", due: "2026-11-20" },
    { idx: 3, title: "보고", assigneeId: "u1", due: null },
  ]);
});

test("buildRoutinePrompt: 직원 목록·자동 완료 규칙 포함", () => {
  const { system } = buildRoutinePrompt({ agent_key: "accounting-clerk", title: "미수금 점검", instructions: "점검" }, "2026-11-18", "데이터", null, staff);
  assert.match(system, /김경리\(경리\)/);
  assert.match(system, /특이사항 없음/);
  assert.match(system, /최대 5개/);
});

test("defaultPicks: 승인은 항상 배정 — 추천 없으면 승인자, 액션 없으면 결과 전체 1건", () => {
  const views = actionViews([
    { text: "입금 독촉 · 김경리 · 2026-11-20" },
    { text: "물류사 확인 · 물류팀" },
  ], staff);
  assert.deepEqual(defaultPicks(views, "미수금 점검", "u1"), [
    { idx: 0, title: "입금 독촉", assigneeId: "u2", due: "2026-11-20" },
    { idx: 1, title: "물류사 확인", assigneeId: "u1", due: null },
  ]);
  assert.deepEqual(defaultPicks([], "SNS 기획안", "u1"), [{ idx: WHOLE, title: "SNS 기획안 실행", assigneeId: "u1", due: null }]);
  assert.equal(cleanPicks(defaultPicks([], "SNS 기획안", "u1"), new Set(["u1"])).length, 1);
  assert.equal(cleanPicks([{ idx: -2, title: "x", assigneeId: "u1", due: null }], new Set(["u1"])).length, 0);
});

test("reportBody: 머리말·지시문 제거", () => {
  const note = "[AI 정기업무 결과 · 2026-11-18 · m]\n사내 검토용 초안입니다.\n\n1. 결론\n없음\n\n[업무 지시] 점검";
  assert.equal(reportBody(note), "1. 결론\n없음");
});
