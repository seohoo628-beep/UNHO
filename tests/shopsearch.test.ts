import { test } from "node:test";
import assert from "node:assert/strict";

import { searchShop } from "../src/lib/shopsearch";

/**
 * 11번가 상품검색 응답 파싱 테스트.
 *
 * 실제 API 는 이 환경에서 호출할 수 없어(키 없음 + 아웃바운드 차단) fetch 를
 * 가로채 응답 본문만 넣는다. 태그 이름 표기가 문서마다 갈려서 파서를 느슨하게
 * 짰으므로, 그 느슨함이 실제로 동작하는지와 오류 응답을 사람이 읽을 수 있는
 * 문장으로 바꾸는지를 확인한다.
 */

process.env.ELEVENTH_API_KEY = "test-key";

type FetchFn = typeof globalThis.fetch;
const realFetch = globalThis.fetch;

/** 본문을 EUC-KR 로 인코딩할 수 없으므로, 한글이 없는 경우만 바이트로 넣는다. */
function stubFetch(body: string, status = 200, bytes?: Uint8Array) {
  globalThis.fetch = (async () => {
    const buf = bytes ? bytes.buffer.slice(0) : new TextEncoder().encode(body).buffer;
    return {
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: async () => buf,
    } as unknown as Response;
  }) as FetchFn;
}

const restore = () => {
  globalThis.fetch = realFetch;
};

test("11번가 상품검색: 상품명·판매가·리뷰수를 뽑는다", async () => {
  stubFetch(`<?xml version="1.0" encoding="utf-8"?>
<ProductSearchResponse>
  <TotalCount>2</TotalCount>
  <Products>
    <Product>
      <ProductCode>1234</ProductCode>
      <ProductName><![CDATA[상쾌환 부스터 20포]]></ProductName>
      <ProductPrice>29900</ProductPrice>
      <SalePrice>25900</SalePrice>
      <ReviewCount>120</ReviewCount>
      <Rating>4.8</Rating>
      <Seller>삼양사몰</Seller>
      <DetailPageUrl>https://www.11st.co.kr/products/1234</DetailPageUrl>
    </Product>
    <Product>
      <ProductName>컨디션 스틱 10입</ProductName>
      <ProductPrice>19,900</ProductPrice>
      <ReviewCount>88</ReviewCount>
    </Product>
  </Products>
</ProductSearchResponse>`);

  const items = await searchShop("숙취해소제", 10);
  restore();

  assert.equal(items.length, 2);
  assert.equal(items[0].title, "상쾌환 부스터 20포");
  // 판매가가 따로 오면 정가가 아니라 판매가를 쓴다 — 매출 추정이 부풀지 않도록.
  assert.equal(items[0].price, 25900);
  assert.equal(items[0].reviews, 120);
  assert.equal(items[0].rating, 4.8);
  assert.equal(items[0].mall, "삼양사몰");
  // 판매가가 없으면 정가로 떨어지고, 천단위 쉼표도 벗겨낸다.
  assert.equal(items[1].price, 19900);
  assert.equal(items[1].mall, "11번가");
});

test("11번가 상품검색: 태그 표기가 소문자여도 읽는다", async () => {
  stubFetch(`<response><product>
    <productName>테스트 제품</productName><productPrice>1000</productPrice><reviewCount>5</reviewCount>
  </product></response>`);
  const items = await searchShop("테스트");
  restore();
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "테스트 제품");
  assert.equal(items[0].price, 1000);
  assert.equal(items[0].reviews, 5);
});

test("11번가 상품검색: 결과 0건은 오류가 아니라 빈 배열", async () => {
  stubFetch(`<ProductSearchResponse><TotalCount>0</TotalCount></ProductSearchResponse>`);
  const items = await searchShop("없는제품명");
  restore();
  assert.deepEqual(items, []);
});

test("11번가 상품검색: 키 오류는 원문 메시지를 붙여 던진다", async () => {
  stubFetch(`<Response><ErrorCode>E001</ErrorCode><ErrorMessage>인증키가 유효하지 않습니다</ErrorMessage></Response>`);
  await assert.rejects(
    () => searchShop("숙취해소제"),
    (e: Error) => {
      assert.match(e.message, /E001/);
      assert.match(e.message, /인증키가 유효하지 않습니다/);
      assert.match(e.message, /승인 상태/);
      return true;
    }
  );
  restore();
});

test("11번가 상품검색: 형식이 예상과 다르면 원문 앞부분을 남긴다", async () => {
  stubFetch(`{"unexpected":"json body"}`);
  await assert.rejects(
    () => searchShop("숙취해소제"),
    (e: Error) => {
      assert.match(e.message, /상품을 찾지 못했습니다/);
      assert.match(e.message, /unexpected/);
      return true;
    }
  );
  restore();
});

test("11번가 상품검색: EUC-KR 본문을 한글로 읽는다", async () => {
  // "제품" 을 EUC-KR 로 인코딩한 바이트. UTF-8 로 읽으면 깨진다.
  const eucName = Uint8Array.from([0xc1, 0xa6, 0xc7, 0xb0]);
  const head = new TextEncoder().encode("<r><Product><ProductName>");
  const tail = new TextEncoder().encode("</ProductName><ProductPrice>500</ProductPrice></Product></r>");
  const bytes = new Uint8Array(head.length + eucName.length + tail.length);
  bytes.set(head, 0);
  bytes.set(eucName, head.length);
  bytes.set(tail, head.length + eucName.length);

  stubFetch("", 200, bytes);
  const items = await searchShop("제품");
  restore();
  assert.equal(items[0].title, "제품");
});

test("11번가 상품검색: 키가 없으면 설정 안내로 막는다", async () => {
  const saved = process.env.ELEVENTH_API_KEY;
  delete process.env.ELEVENTH_API_KEY;
  await assert.rejects(() => searchShop("숙취해소제"), /설정되지 않았습니다/);
  process.env.ELEVENTH_API_KEY = saved;
});
