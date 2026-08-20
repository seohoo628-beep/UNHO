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

/**
 * 네이버가 돌려주는 에러 본문을 사람이 읽을 수 있는 한 줄로 만든다.
 * 상태코드만 보면 원인을 좁힐 수 없어서 errorCode·errorMessage 를 그대로 붙이고,
 * 자주 나오는 코드는 실제로 무엇을 고쳐야 하는지까지 적는다.
 */
async function describeError(res: Response, what: string): Promise<string> {
  let code = "";
  let detail = "";
  try {
    const raw = await res.text();
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      code = String(j.errorCode ?? j.code ?? j.status ?? "");
      detail = String(j.errorMessage ?? j.message ?? j.title ?? "");
    } catch {
      detail = raw.slice(0, 200);
    }
  } catch {
    /* 본문을 못 읽어도 상태코드는 남긴다 */
  }
  // 401 은 키 불일치와 "앱에 검색 API 미추가"가 같은 코드로 온다. 후자가 훨씬 흔해서 먼저 적는다.
  const hint =
    res.status === 401
      ? "이 앱에 검색 API 가 붙어 있지 않을 때 나는 응답입니다(개요 탭의 ‘비로그인 오픈 API 당일 사용량’에 검색이 보여야 합니다). 검색은 현재 신규 등록이 막혀 있어 API 제휴 신청으로 승인을 받아야 합니다. 검색이 이미 보이는데도 이 오류가 나면 Client ID·Secret 을 다시 복사해 주세요(앞뒤 공백 주의)."
      : res.status === 403
        ? "일일 호출 한도를 넘었거나 접근이 차단되었습니다."
        : res.status === 429
          ? "호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
          : "";
  const parts = [`${what} 실패 (${res.status}${code ? ` ${code}` : ""})`];
  if (detail) parts.push(detail);
  if (hint) parts.push(hint);
  return parts.join(" — ");
}

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
  if (!res.ok) throw new Error(await describeError(res, "쇼핑 검색"));
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
    if (!res.ok) throw new Error(await describeError(res, "키워드도구"));
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
