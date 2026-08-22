import { test } from "node:test";
import assert from "node:assert/strict";

import { readPrevSnapshots, storeSnapshots, logShopQuery, recentShopQueries } from "../src/lib/reviewSnapshots";

/**
 * 리뷰 스냅샷 규칙 테스트.
 *
 * 화면 검색과 정기 재검색(cron)이 같은 규칙으로 쓰는 부분이라, 여기가 어긋나면
 * 판매건수 추정이 조용히 틀어진다. supabase 대신 호출을 기록하는 가짜 클라이언트로
 * "무엇을 어떤 조건으로 읽고 쓰는지"를 잠근다.
 */

type Call = { table: string; op: string; args: unknown[] };

function fakeDb(result: { data?: unknown; error?: unknown } = { data: [] }) {
  const calls: Call[] = [];
  const chain = (table: string) => {
    const push = (op: string, ...args: unknown[]) => {
      calls.push({ table, op, args });
      return handler;
    };
    const handler: Record<string, unknown> = {
      select: (...a: unknown[]) => push("select", ...a),
      in: (...a: unknown[]) => push("in", ...a),
      lt: (...a: unknown[]) => push("lt", ...a),
      gte: (...a: unknown[]) => push("gte", ...a),
      limit: (...a: unknown[]) => push("limit", ...a),
      order: (...a: unknown[]) => {
        calls.push({ table, op: "order", args: a });
        return Promise.resolve(result);
      },
      upsert: (...a: unknown[]) => {
        calls.push({ table, op: "upsert", args: a });
        return Promise.resolve(result);
      },
    };
    // recentShopQueries 는 order 뒤에 limit 이 온다 — order 도 체인을 돌려줘야 한다.
    handler.order = (...a: unknown[]) => {
      calls.push({ table, op: "order", args: a });
      return Object.assign(Promise.resolve(result), { limit: (...b: unknown[]) => { calls.push({ table, op: "limit", args: b }); return Promise.resolve(result); } });
    };
    return handler;
  };
  return { db: { from: chain }, calls };
}

test("이전 스냅샷: 링크별 최신 한 건만, 오늘 값은 제외", async () => {
  const { db, calls } = fakeDb({
    data: [
      { link: "a", captured_on: "2026-08-20", reviews: 370 }, // 최신이 먼저 온다
      { link: "a", captured_on: "2026-08-12", reviews: 310 },
      { link: "b", captured_on: "2026-08-19", reviews: 55 },
    ],
  });
  const prev = await readPrevSnapshots(db, ["a", "b", "a", ""], "2026-08-22");
  assert.deepEqual(prev.get("a"), { d: "2026-08-20", r: 370 });
  assert.deepEqual(prev.get("b"), { d: "2026-08-19", r: 55 });
  const inCall = calls.find((c) => c.op === "in");
  assert.deepEqual(inCall?.args[1], ["a", "b"]); // 중복·빈 링크 제거
  const ltCall = calls.find((c) => c.op === "lt");
  assert.deepEqual(ltCall?.args, ["captured_on", "2026-08-22"]); // 오늘 값이 기준선이 되면 증분이 늘 0이다
});

test("저장: 링크 없는 것은 건너뛰고, 한 배치에 같은 링크는 한 번만", async () => {
  const { db, calls } = fakeDb({ data: [] });
  const n = await storeSnapshots(db, [
    { link: "a", title: "A", reviews: 10, price: 1000 },
    { link: "", title: "링크없음", reviews: 5, price: 500 },
    { link: "a", title: "A(중복)", reviews: 11, price: 1000 }, // 같은 배치에 중복 키면 upsert 가 실패한다
    { link: "b", title: "B", reviews: 7, price: 700 },
  ], "2026-08-22");
  assert.equal(n, 2);
  const up = calls.find((c) => c.op === "upsert");
  const rows = up?.args[0] as { link: string; captured_on: string }[];
  assert.deepEqual(rows.map((r) => r.link), ["a", "b"]);
  assert.ok(rows.every((r) => r.captured_on === "2026-08-22"));
  assert.deepEqual(up?.args[1], { onConflict: "link,captured_on" }); // 하루 한 줄
});

test("저장할 게 없으면 upsert 를 부르지 않는다", async () => {
  const { db, calls } = fakeDb();
  assert.equal(await storeSnapshots(db, [{ link: "", title: "x", reviews: 1, price: 1 }]), 0);
  assert.equal(calls.filter((c) => c.op === "upsert").length, 0);
});

test("검색어 기록: 공백은 버리고 query 키로 upsert", async () => {
  const { db, calls } = fakeDb();
  await logShopQuery(db, "  ");
  assert.equal(calls.length, 0);
  await logShopQuery(db, " 바나바잎추출물 ");
  const up = calls.find((c) => c.op === "upsert");
  assert.equal((up?.args[0] as { query: string }).query, "바나바잎추출물");
  assert.deepEqual(up?.args[1], { onConflict: "query" });
});

test("재검색 대상: 최근 순으로 기간·개수를 자른다", async () => {
  const { db, calls } = fakeDb({ data: [{ query: "혈당케어" }, { query: "오메가3" }] });
  const qs = await recentShopQueries(db, { days: 60, limit: 40 });
  assert.deepEqual(qs, ["혈당케어", "오메가3"]);
  assert.ok(calls.some((c) => c.op === "gte" && c.args[0] === "last_used"));
  assert.ok(calls.some((c) => c.op === "limit" && c.args[0] === 40));
});

test("읽기 오류는 삼키지 않고 던진다", async () => {
  const { db } = fakeDb({ data: null, error: new Error("relation does not exist") });
  await assert.rejects(() => readPrevSnapshots(db, ["a"], "2026-08-22"), /does not exist/);
  await assert.rejects(() => storeSnapshots(db, [{ link: "a", title: "A", reviews: 1, price: 1 }]), /does not exist/);
});
