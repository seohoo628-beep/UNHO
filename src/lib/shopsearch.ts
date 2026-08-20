import { getSetting } from "@/lib/settings";

/**
 * 경쟁 제품 검색 — 11번가 오픈API 상품검색.
 *
 * 네이버 쇼핑 검색 API 는 2026-07-31 자로 종료됐고 공식 대체가 없다
 * (NAVER API HUB 로 이관된 것은 일반 검색·검색어트렌드·쇼핑인사이트뿐이라
 * 제품명·판매가를 돌려주지 않는다). 그래서 경쟁 제품 조회는 11번가로 옮겼다.
 * 11번가는 리뷰수·평점까지 주므로 엑셀로 채우던 열이 하나 줄어든다.
 *
 * 키는 환경변수 > app_settings 순으로 읽는다(설정 화면에서 대표가 저장).
 */

const ENDPOINT = "https://openapi.11st.co.kr/openapi/OpenApiService.tmall";

export type ShopItem = {
  title: string;
  price: number;
  mall: string;
  brand: string;
  link: string;
  category: string;
  reviews: number;
  rating: number;
};

export async function getShopKey(): Promise<string> {
  const env = process.env.ELEVENTH_API_KEY;
  return (env && env.trim()) || ((await getSetting("eleventh_api_key")) ?? "").trim();
}

export const shopConfigured = (key: string) => !!key;

/** <Tag>값</Tag> 를 꺼낸다. 대소문자·CDATA·공백을 가리지 않는다. */
function pick(xml: string, names: string[]): string {
  for (const n of names) {
    const m = xml.match(new RegExp(`<${n}\\s*>([\\s\\S]*?)</${n}\\s*>`, "i"));
    if (!m) continue;
    const v = m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
    if (v) return v;
  }
  return "";
}

const toNum = (v: string): number => Number(v.replace(/[^\d.-]/g, "")) || 0;

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, "")
    .trim();
}

/**
 * 11번가 응답은 EUC-KR 이다. 혹시 UTF-8 로 바뀌더라도 깨지지 않도록,
 * 디코딩 결과에 치환문자(U+FFFD)가 섞이면 UTF-8 로 다시 읽는다.
 */
function decodeBody(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  try {
    const euc = new TextDecoder("euc-kr").decode(bytes);
    if (!euc.includes("�")) return euc;
    const utf = new TextDecoder("utf-8").decode(bytes);
    return utf.includes("�") ? euc : utf;
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/**
 * 상품 검색. display 는 11번가 페이지 크기로 넘기고, 응답이 그보다 많이 와도
 * 화면에서 쓰는 만큼만 자른다.
 */
export async function searchShop(query: string, display = 20): Promise<ShopItem[]> {
  const key = await getShopKey();
  if (!shopConfigured(key)) throw new Error("11번가 오픈API 키가 설정되지 않았습니다");

  const size = Math.min(100, Math.max(1, display));
  const url =
    `${ENDPOINT}?key=${encodeURIComponent(key)}&apiCode=ProductSearch` +
    `&keyword=${encodeURIComponent(query)}&pageNum=1&pageSize=${size}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error("경쟁 제품 검색: 11번가 서버에 연결하지 못했습니다");
  }
  const body = decodeBody(await res.arrayBuffer());
  if (!res.ok) throw new Error(`경쟁 제품 검색 실패 (${res.status}) — ${body.slice(0, 200)}`);

  // 키가 틀리거나 승인 전이면 상품 대신 에러 엘리먼트가 온다.
  const errMsg = pick(body, ["ErrorMessage", "Message", "message", "resultMsg"]);
  const errCode = pick(body, ["ErrorCode", "errorCode", "resultCode"]);
  const blocks = body.match(/<Product\s*>[\s\S]*?<\/Product\s*>/gi) ?? [];
  if (!blocks.length) {
    if (errMsg || errCode)
      throw new Error(
        `경쟁 제품 검색 실패${errCode ? ` (${errCode})` : ""} — ${errMsg || "11번가가 오류를 돌려줬습니다"}` +
          " — 오픈API 키와 승인 상태를 확인하세요"
      );
    // "결과 0건"과 "응답 형식이 바뀜"을 구분한다. 태그가 아예 없는 응답을 0건으로
    // 삼키면 형식 변화가 조용히 묻히므로, TotalCount 가 실제로 있을 때만 0건으로 본다.
    const totalTag = body.match(/<TotalCount\s*>([\s\S]*?)<\/TotalCount\s*>/i);
    if (totalTag && toNum(totalTag[1]) === 0) return [];
    throw new Error(`경쟁 제품 검색: 응답에서 상품을 찾지 못했습니다 — 원문 ${body.slice(0, 200)}`);
  }

  return blocks.slice(0, size).map((b) => {
    // 판매가가 따로 오면 그쪽이 실제 결제가라 우선한다.
    const sale = toNum(pick(b, ["SalePrice", "salePrice", "DiscountPrice"]));
    const list = toNum(pick(b, ["ProductPrice", "productPrice", "Price", "price"]));
    return {
      title: unescapeXml(pick(b, ["ProductName", "productName", "Name"])),
      price: sale || list,
      mall: unescapeXml(pick(b, ["Seller", "seller", "SellerNick", "SellerName"])) || "11번가",
      brand: unescapeXml(pick(b, ["Brand", "brand", "Maker", "maker"])),
      link: pick(b, ["DetailPageUrl", "detailPageUrl", "ProductUrl", "link"]),
      category: unescapeXml(pick(b, ["CategoryName", "categoryName", "Category"])),
      reviews: toNum(pick(b, ["ReviewCount", "reviewCount", "ReviewCnt"])),
      rating: toNum(pick(b, ["Rating", "rating", "SatisfyRate", "BuySatisfy"])),
    };
  });
}
