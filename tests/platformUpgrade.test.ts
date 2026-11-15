import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRows, parseTable, normDate } from "../src/lib/dataImport";
import { buildScorecard } from "../src/lib/agentScorecard";
import { stockRisk, reportHeadline } from "../src/lib/situation";
import { buildRoutinePrompt } from "../src/lib/agents/routine";

test("parseTable: 엑셀 탭·CSV 따옴표·빈 줄", () => {
  assert.deepEqual(parseTable("a\tb\n1\t2\n\n"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseTable('이름,메모\n"홍, 길동","줄1\n줄2"'), [["이름", "메모"], ["홍, 길동", "줄1\n줄2"]]);
});

test("normDate: 여러 형식", () => {
  assert.equal(normDate("2026.11.5", "2026-11-16"), "2026-11-05");
  assert.equal(normDate("20261105", "2026-11-16"), "2026-11-05");
  assert.equal(normDate("2026-11-05 13:20", "2026-11-16"), "2026-11-05");
  assert.equal(normDate("11/5", "2026-11-16"), "2026-11-05");
  assert.equal(normDate("미정", "2026-11-16"), null);
});

test("mapRows CS: 스마트스토어식 머리글 매핑, 상태 정규화, 필수값 없는 행 제외", () => {
  const r = mapRows("cs", "문의일시\t구매자명\t상품주문번호\t문의유형\t문의내용\t답변상태\n2026.11.15 10:00\t김\t123\t배송\t언제 와요\t답변완료\n2026.11.16\t이\t\t교환\t\t미답변", "2026-11-16");
  assert.equal(r.rows.length, 1);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.rows[0], { received_at: "2026-11-15", customer: "김", order_no: "123", category: "배송", content: "언제 와요", status: "완료" });
  assert.equal(r.mapping.content, "문의내용");
});

test("mapRows 출고·CRM: 기본값과 단계·구분", () => {
  const s = mapRows("shipments", "발송일,상품명,수량,택배사,운송장번호\n11/14,주당의비결 정제,3개,CJ,555\n,무당티,,,", "2026-11-16");
  assert.equal(s.rows[0].qty, 3);
  assert.equal(s.rows[0].ship_date, "2026-11-14");
  assert.equal(s.rows[1].ship_date, "2026-11-16");
  assert.equal(s.rows[1].qty, 1);
  assert.equal(s.rows[0].status, "출고");
  const c = mapRows("crm", "업체명\t구분\t진행상태\n올리브영\t입점 바이어\t제안 완료\n먹방채널\t셀러\t", "2026-11-16");
  assert.deepEqual([c.rows[0].kind, c.rows[0].stage, c.rows[1].kind, c.rows[1].stage], ["buyer", "제안", "seller", "발굴"]);
});

test("buildScorecard: 실행·승인·반려 집계와 제안", () => {
  const rows = [
    ...Array.from({ length: 4 }, () => ({ assignee_user_id: "a", routine_id: "r", agent_status: "완료", agent_review: null, agent_reject_count: 1 })),
    { assignee_user_id: "a", routine_id: "r", agent_status: "완료", agent_review: "승인", agent_reject_count: 0 },
    { assignee_user_id: "b", routine_id: "r", agent_status: "실패" },
  ];
  const sc = buildScorecard(rows, [{ id: "a", name: "AI 경리" }, { id: "b", name: "AI CS" }]);
  assert.deepEqual([sc[0].name, sc[0].runs, sc[0].approved, sc[0].rejected, sc[0].approvalRate], ["AI 경리", 5, 1, 4, 20]);
  assert.match(sc[0].advice ?? "", /반려가 절반/);
  assert.equal(sc[1].failed, 1);
});

test("stockRisk·reportHeadline", () => {
  const r = stockRisk([
    { item: "정제", current_stock: 30, out_30d: 90, safety_days: 7, lead_time_days: 14 }, // 10일 < 21
    { item: "젤리", current_stock: 900, out_30d: 90, safety_days: 7, lead_time_days: 14 }, // 300일
    { item: "신규", current_stock: 5, out_30d: 0, safety_days: 7, lead_time_days: 14 }, // 출고 없음 → 제외
  ]);
  assert.deepEqual(r, { risky: [{ item: "정제", days: 10, need: 21 }], total: 1 });
  const note = "[AI 정기업무 결과 · d · m]\n사내 검토용\n\n1. 결론\n- 매출 정상\n- 미수 2건\n2. 상세\n- x\n\n[업무 지시] y";
  assert.equal(reportHeadline(note), "- 매출 정상\n- 미수 2건");
});

test("buildRoutinePrompt: 반려 피드백 반영", () => {
  const { user } = buildRoutinePrompt({ agent_key: "cs-manager", title: "CS", instructions: "정리" }, "2026-11-16", "[x]", "- 표로 쓰지 말 것");
  assert.match(user, /대표 피드백/);
  assert.match(user, /표로 쓰지 말 것/);
});
