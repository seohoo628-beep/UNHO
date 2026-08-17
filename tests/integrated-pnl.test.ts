// 통합 P&L 엔진이 원장에서 다시 계산한 값이 구글 시트 "UC_운영도구_P&L"의
// 월간P&L·주간P&L·연간P&L 탭 값과 같은지 대조한다.
//
// tests/pnl-sheet-expected.json 은 시트에서 그대로 뽑은 기대값이다(사람이 손대지 않는다).
// 이 테스트가 깨지면 엔진 규칙이 시트와 어긋난 것이다.

import { test } from "node:test";
import assert from "node:assert/strict";
import expected from "./pnl-sheet-expected.json";
import {
  buildReport,
  brandSlices,
  channelSlices,
  accountSlices,
  monthPeriods,
  isoWeek,
  BRANDS,
  COGS_ACCOUNTS,
  SGA_ACCOUNTS,
  SALES,
  BUYS,
  type PnlColumn,
} from "../src/lib/integrated-pnl";

type Fixture = Record<string, Record<string, number[]>>;
const EXP = expected as unknown as Fixture;

const r = (n: number) => Math.round(n);

/** 손익 라인 하나를 열 배열로 뽑는다(기간 열 + 합계 열). */
function line(cols: PnlColumn[], name: string): number[] {
  return cols.map((c) => {
    if (BRANDS.includes(name as (typeof BRANDS)[number]) || name === "브랜드 미지정")
      return r(c.revenueByBrand[name] ?? 0);
    if (COGS_ACCOUNTS.includes(name)) return r(c.cogs[name] ?? 0);
    if (SGA_ACCOUNTS.includes(name)) return r(c.sga[name] ?? 0);
    switch (name) {
      case "총매출":
        return r(c.totalRevenue);
      case "매출원가 합":
        return r(c.cogsTotal);
      case "매출총이익":
        return r(c.grossProfit);
      case "수수료":
        return r(c.fee);
      case "판관비 합":
        return r(c.sgaTotal);
      case "영업이익":
        return r(c.opProfit);
      case "이자비용":
        return r(c.interest);
      case "세전이익":
        return r(c.pretaxProfit);
      case "원장총액":
        return r(c.audit.ledgerTotal);
      case "반영액":
        return r(c.audit.reflected);
      case "차액":
        return r(c.audit.gap);
      case "재무거래":
        return r(c.audit.finance);
      case "내부거래":
        return r(c.audit.intra);
      case "카드대금":
        return r(c.audit.card);
      case "환불":
        return r(c.audit.refund);
      case "미분류":
        return r(c.audit.unclassified);
      case "미분류건수":
        return c.audit.unclassifiedCount;
      case "정산입금":
        return r(c.nonPnlInflow.settlement);
      case "재무입금":
        return r(c.nonPnlInflow.financing);
      default:
        throw new Error(`알 수 없는 라인: ${name}`);
    }
  });
}

function compare(label: string, cols: PnlColumn[], fixture: Record<string, number[]>) {
  for (const [name, want] of Object.entries(fixture)) {
    const got = line(cols, name);
    assert.equal(got.length, want.length, `${label} · ${name} 열 개수`);
    for (let i = 0; i < want.length; i++) {
      // 시트는 원 단위 반올림 표시라 1원 오차는 허용한다.
      assert.ok(
        Math.abs(got[i] - want[i]) <= 1,
        `${label} · ${name} · ${i}번째 열 — 시트 ${want[i].toLocaleString()} / 엔진 ${got[i].toLocaleString()}`
      );
    }
  }
}

test("월간 P&L 2026 — 시트 월간P&L 탭과 전 라인 일치", () => {
  const rep = buildReport({ kind: "month", year: 2026 });
  compare("월간2026", [...rep.columns, rep.totalColumn], EXP.month2026);
});

test("주간 P&L 2026 3분기 — 시트 주간P&L 탭과 전 라인 일치", () => {
  const rep = buildReport({ kind: "week", year: 2026, quarter: 3 });
  compare("주간2026Q3", [...rep.columns, rep.totalColumn], EXP.weekQ3);
});

test("연간 P&L 2025~2029 — 시트 연간P&L 탭과 전 라인 일치", () => {
  const rep = buildReport({ kind: "year", year: 2025, yearCount: 5 });
  compare("연간", rep.columns, EXP.year);
});

test("손익 등식 — 매출총이익·영업이익·세전이익이 라인 합과 맞는다", () => {
  const rep = buildReport({ kind: "month", year: 2026 });
  for (const c of [...rep.columns, rep.totalColumn]) {
    assert.equal(r(c.grossProfit), r(c.totalRevenue - c.cogsTotal), `${c.label} 매출총이익`);
    assert.equal(r(c.opProfit), r(c.grossProfit - c.sgaTotal), `${c.label} 영업이익`);
    assert.equal(r(c.pretaxProfit), r(c.opProfit - c.interest), `${c.label} 세전이익`);
    const brandSum = Object.values(c.revenueByBrand).reduce((a, b) => a + b, 0);
    assert.equal(r(brandSum), r(c.totalRevenue), `${c.label} 브랜드 매출 합`);
  }
});

test("브랜드 필터 — 5개 브랜드 + 미지정의 합이 전사 통합과 같다", () => {
  const all = buildReport({ kind: "month", year: 2026 }).totalColumn;
  const parts = [...BRANDS, "브랜드 미지정"].map(
    (b) => buildReport({ kind: "month", year: 2026, brand: b }).totalColumn
  );
  const add = (f: (c: PnlColumn) => number) => parts.reduce((a, c) => a + f(c), 0);
  assert.equal(r(add((c) => c.totalRevenue)), r(all.totalRevenue), "매출");
  assert.equal(r(add((c) => c.cogsTotal)), r(all.cogsTotal), "매출원가");
  assert.equal(r(add((c) => c.sgaTotal)), r(all.sgaTotal), "판관비");
  assert.equal(r(add((c) => c.interest)), r(all.interest), "이자비용");
  assert.equal(r(add((c) => c.audit.ledgerTotal)), r(all.audit.ledgerTotal), "매입원장 총액");
});

test("대운목장·신미집 매장 손익이 원장에서 잡힌다", () => {
  for (const b of ["대운목장", "신미집"]) {
    const c = buildReport({ kind: "month", year: 2026, brand: b }).totalColumn;
    assert.ok(c.totalRevenue > 0, `${b} 매출`);
    assert.ok(c.cogsTotal > 0, `${b} 매출원가(식자재·주류)`);
    assert.ok(c.cogs["식자재·주류"] > 0, `${b} 식자재·주류`);
  }
});

test("브랜드 단면 합계 = 해당 월 전사 매출", () => {
  const p = monthPeriods(2026)[4]; // 5월
  const slices = brandSlices(p);
  const total = slices.reduce((a, s) => a + s.revenue, 0);
  const month = buildReport({ kind: "month", year: 2026 }).columns[4];
  assert.equal(r(total), r(month.totalRevenue));
  // 시트 대시보드 ② 브랜드별 당월 매출(2026-05)
  const want: Record<string, number> = {
    주당의비결: 101160234,
    뷰티밤: 8452100,
    파트너사: 1081621,
    대운목장: 58781900,
    신미집: 27209100,
  };
  for (const s of slices) if (want[s.brand] != null) assert.equal(r(s.revenue), want[s.brand], s.brand);
});

test("채널 단면 — 시트 대시보드 ③(2026-05)과 일치", () => {
  const p = monthPeriods(2026)[4];
  const rows = channelSlices(p);
  const at = (ch: string) => rows.find((c) => c.channel === ch);
  assert.equal(r(at("스마트스토어")!.revenue), 10259946);
  assert.equal(r(at("매장")!.revenue), 85991000);
  assert.equal(r(at("기타")!.revenue), 100434009);
  assert.equal(r(rows.reduce((a, c) => a + c.revenue, 0)), 196684955);
});

test("계정과목 단면 — 시트 대시보드 ④(2026-05)과 일치", () => {
  const p = monthPeriods(2026)[4];
  const rows = accountSlices(p);
  const at = (a: string) => rows.find((c) => c.account === a)?.amount ?? 0;
  assert.equal(r(at("광고선전비")), 157317836);
  assert.equal(r(at("인건비")), 115555577);
  assert.equal(r(at("미분류")), 21550373);
  assert.equal(r(rows.reduce((a, c) => a + c.amount, 0)), 441473561);
});

test("rule 모드 — 시트 자동열 공란 21건이 계정매핑표로 채워진다", () => {
  const sheet = buildReport({ kind: "month", year: 2026, mode: "sheet" }).totalColumn;
  const rule = buildReport({ kind: "month", year: 2026, mode: "rule" }).totalColumn;
  assert.equal(sheet.audit.autoGapCount, 21);
  assert.ok(sheet.audit.autoGapAmount > 0);
  // 공란 행이 손익에 들어오므로 sheet 모드보다 비용이 커진다.
  assert.ok(rule.cogsTotal + rule.sgaTotal + rule.interest > sheet.cogsTotal + sheet.sgaTotal + sheet.interest);
  // 반영액 + 미반영액 = 원장 총액 (두 모드 모두)
  for (const c of [sheet, rule]) {
    assert.equal(r(c.audit.reflected + c.audit.gap), r(c.audit.ledgerTotal));
  }
});

test("ISO 주차 계산", () => {
  assert.equal(isoWeek("2026-01-01"), 1);
  assert.equal(isoWeek("2026-12-31"), 53);
  assert.equal(isoWeek("2025-12-08"), 50);
});

test("원장 적재량 — 시트 캡처 시점 행 수", () => {
  assert.equal(SALES.length, 2210);
  assert.equal(BUYS.length, 2139);
  assert.ok(SALES.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date)));
  assert.ok(BUYS.every((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date)));
});
