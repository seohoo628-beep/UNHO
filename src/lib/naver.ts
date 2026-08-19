import crypto from "crypto";
import { getSetting } from "@/lib/settings";

/**
 * 네이버 오픈API(쇼핑 검색) + 검색광고API(키워드도구) 클라이언트.
 *
 * 쇼핑 검색은 경쟁 제품명·판매가를 가져온다. 판매건수·리뷰수·유입수는
 * 공개 API 로 제공되지 않으므로 인터뷰지에서 엑셀 업로드로 계속 채운다.
 * 키워드도구는 월간 검색수(PC+모바일)를 준다.
 *
 * 키는 환경변수 > app_settings 순으로 읽는다(설정 화면에서 대표가 저장).
 */

export type NaverKeys = {
  clientId: string;
  clientSecret: string;
  adKey: string;
  adSecret: string;
  adCustomerId: string;
};

const pick = async (env: string | undefined, key: string): Promise<string> =>
  (env && env.trim()) || ((await getSetting(key)) ?? "").trim();

export async function getNaverKeys(): Promise<NaverKeys> {
  const [clientId, clientSecret, adKey, adSecret, adCustomerId] = await Promise.all([
    pick(process.env.NAVER_CLIENT_ID, "naver_client_id"),
    pick(process.env.NAVER_CLIENT_SECRET, "naver_client_secret"),
    pick(process.env.NAVER_AD_API_KEY, "naver_ad_api_key"),
    pick(process.env.NAVER_AD_SECRET_KEY, "naver_ad_secret_key"),
    pick(process.env.NAVER_AD_CUSTOMER_ID, "naver_ad_customer_id"),
  ]);
  return { clientId, clientSecret, adKey, adSecret, adCustomerId };
}

export const shopConfigured = (k: NaverKeys) => !!(k.clientId && k.clientSecret);
export const adConfigured = (k: NaverKeys) => !!(k.adKey && k.adSecret && k.adCustomerId);

export type ShopItem = {
  title: string;
  price: number;
  mall: string;
  brand: string;
  link: string;
  category: string;
};

/** 쇼핑 검색 — 경쟁 제품명과 판매가. display 최대 100. */
export async function searchShop(query: string, display = 20): Promise<ShopItem[]> {
  const k = await getNaverKeys();
  if (!shopConfigured(k)) throw new Error("네이버 오픈API 키가 설정되지 않았습니다");
  const url =
    "https://openapi.naver.com/v1/search/shop.json?query=" +
    encodeURIComponent(query) +
    `&display=${Math.min(100, Math.max(1, display))}&sort=sim`;
  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": k.clientId, "X-Naver-Client-Secret": k.clientSecret },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`쇼핑 검색 실패 (${res.status})`);
  const json = (await res.json()) as { items?: Record<string, string>[] };
  return (json.items ?? []).map((it) => ({
    // 검색 결과 제목에는 <b> 강조 태그와 HTML 엔티티가 섞여 온다.
    title: String(it.title ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim(),
    price: Number(it.lprice) || 0,
    mall: String(it.mallName ?? ""),
    brand: String(it.brand || it.maker || ""),
    link: String(it.link ?? ""),
    category: [it.category1, it.category2, it.category3].filter(Boolean).join(" > "),
  }));
}

/** 검색광고 API 서명 — HMAC-SHA256(timestamp.METHOD.path, secret) base64. */
function adSignature(secret: string, ts: string, method: string, path: string): string {
  return crypto.createHmac("sha256", secret).update(`${ts}.${method}.${path}`).digest("base64");
}

export type KeywordStat = { keyword: string; pc: number; mobile: number; total: number; comp: string };

/**
 * 키워드도구 — 월간 검색수. 한 번에 5개까지만 받으므로 5개씩 끊어 부른다.
 * 검색수가 10 미만이면 "< 10" 문자열로 오는데 이때는 5로 잡는다.
 */
export async function keywordStats(keywords: string[]): Promise<KeywordStat[]> {
  const k = await getNaverKeys();
  if (!adConfigured(k)) throw new Error("네이버 검색광고 API 키가 설정되지 않았습니다");
  const clean = [...new Set(keywords.map((s) => (s || "").replace(/\s/g, "").trim()).filter(Boolean))];
  const out: KeywordStat[] = [];
  const path = "/keywordstool";
  const n = (v: unknown): number => {
    if (typeof v === "number") return v;
    const t = String(v ?? "").replace(/[^\d]/g, "");
    if (!t) return String(v ?? "").includes("<") ? 5 : 0;
    return Number(t) || 0;
  };

  for (let i = 0; i < clean.length; i += 5) {
    const batch = clean.slice(i, i + 5);
    const ts = String(Date.now());
    const qs = `?hintKeywords=${encodeURIComponent(batch.join(","))}&showDetail=1`;
    const res = await fetch(`https://api.searchad.naver.com${path}${qs}`, {
      headers: {
        "X-Timestamp": ts,
        "X-API-KEY": k.adKey,
        "X-Customer": k.adCustomerId,
        "X-Signature": adSignature(k.adSecret, ts, "GET", path),
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`키워드도구 실패 (${res.status})`);
    const json = (await res.json()) as { keywordList?: Record<string, unknown>[] };
    (json.keywordList ?? []).forEach((r) => {
      const pc = n(r.monthlyPcQcCnt);
      const mo = n(r.monthlyMobileQcCnt);
      out.push({
        keyword: String(r.relKeyword ?? ""),
        pc,
        mobile: mo,
        total: pc + mo,
        comp: String(r.compIdx ?? ""),
      });
    });
  }
  return out;
}
