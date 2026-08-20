import crypto from "crypto";
import { getSetting } from "@/lib/settings";

/**
 * 네이버 검색광고API(키워드도구) 클라이언트. 월간 검색수(PC+모바일)와
 * 연관 키워드를 준다.
 *
 * 쇼핑 검색은 네이버 오픈API 가 2026-07-31 종료돼 11번가로 옮겼다(lib/shopsearch).
 *
 * 키는 환경변수 > app_settings 순으로 읽는다(설정 화면에서 대표가 저장).
 */

export type NaverKeys = {
  adKey: string;
  adSecret: string;
  adCustomerId: string;
};

const pick = async (env: string | undefined, key: string): Promise<string> =>
  (env && env.trim()) || ((await getSetting(key)) ?? "").trim();

export async function getNaverKeys(): Promise<NaverKeys> {
  const [adKey, adSecret, adCustomerId] = await Promise.all([
    pick(process.env.NAVER_AD_API_KEY, "naver_ad_api_key"),
    pick(process.env.NAVER_AD_SECRET_KEY, "naver_ad_secret_key"),
    pick(process.env.NAVER_AD_CUSTOMER_ID, "naver_ad_customer_id"),
  ]);
  return { adKey, adSecret, adCustomerId };
}

export const adConfigured = (k: NaverKeys) => !!(k.adKey && k.adSecret && k.adCustomerId);

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
      ? "액세스 라이선스·비밀키·Customer ID 중 하나가 맞지 않습니다. searchad.naver.com → 도구 → API 사용 관리에서 세 값을 다시 확인해 주세요(앞뒤 공백 주의)."
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
  // 키워드도구는 한글·영문·숫자만 받는다. 쉼표나 슬래시가 하나라도 섞이면
  // 배치 전체가 400(11001) 로 떨어져 나머지 키워드까지 못 받으므로 여기서 턴다.
  const clean = [
    ...new Set(
      keywords.map((s) => (s || "").replace(/[^0-9A-Za-z가-힣]/g, "")).filter((s) => s.length > 0)
    ),
  ];
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
