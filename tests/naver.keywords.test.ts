import { test } from "node:test";
import assert from "node:assert/strict";

import { keywordStats } from "../src/lib/naver";

/**
 * 키워드도구에 보내는 말의 정제 테스트.
 *
 * 키워드에 쉼표나 슬래시가 하나라도 섞이면 네이버가 배치 전체를 400(11001)
 * 으로 거절해 나머지 키워드까지 못 받는다. 실제로 스펙에서 뽑은 '화이트토마토,'
 * 때문에 조회량이 통째로 비었다. 그래서 무엇을 보내는지 직접 확인한다.
 */

process.env.NAVER_AD_API_KEY = "k";
process.env.NAVER_AD_SECRET_KEY = "s";
process.env.NAVER_AD_CUSTOMER_ID = "1";

const realFetch = globalThis.fetch;
const restore = () => {
  globalThis.fetch = realFetch;
};

/** 호출된 URL 들을 모으고 빈 결과를 돌려준다. */
function captureUrls(urls: string[]) {
  globalThis.fetch = (async (u: string) => {
    urls.push(String(u));
    return { ok: true, status: 200, json: async () => ({ keywordList: [] }) } as unknown as Response;
  }) as typeof globalThis.fetch;
}

const hintOf = (url: string) =>
  decodeURIComponent(new URL(url).searchParams.get("hintKeywords") ?? "").split(",");

test("키워드도구: 구두점을 털고 보낸다", async () => {
  const urls: string[] = [];
  captureUrls(urls);
  await keywordStats(["화이트토마토,", "사과맛/청포도맛", "히알루론산"]);
  restore();
  assert.equal(urls.length, 1);
  assert.deepEqual(hintOf(urls[0]), ["화이트토마토", "사과맛청포도맛", "히알루론산"]);
});

test("키워드도구: 공백 제거·중복 제거 후에도 순서를 지킨다", async () => {
  const urls: string[] = [];
  captureUrls(urls);
  await keywordStats(["숙취 해소제", "숙취해소제", " 헛개 "]);
  restore();
  assert.deepEqual(hintOf(urls[0]), ["숙취해소제", "헛개"]);
});

test("키워드도구: 구두점만 있는 말은 아예 빠진다", async () => {
  const urls: string[] = [];
  captureUrls(urls);
  await keywordStats([",", "/", "밀크씨슬"]);
  restore();
  assert.deepEqual(hintOf(urls[0]), ["밀크씨슬"]);
});
