import { getSetting, setSetting } from "@/lib/settings";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// 카카오 "나에게 보내기" 알림.
// KAKAO_REST_API_KEY(env) + 대표 인증으로 받은 refresh_token(app_settings)을 쓴다.
// access_token 은 매 발송 시 refresh_token 으로 새로 발급한다(수명 짧음).

const AUTH = "https://kauth.kakao.com";
const API = "https://kapi.kakao.com";

export const KAKAO_REDIRECT_PATH = "/api/kakao/callback";
export const KAKAO_SCOPE = "talk_message";

export function kakaoRestKey(): string | null {
  return process.env.KAKAO_REST_API_KEY || null;
}

// 클라이언트 시크릿을 "사용함"으로 둔 경우 env 로 넣으면 토큰 요청에 포함한다.
// (끄면 이 값은 없어도 되고, 켜면 반드시 필요하다.)
function kakaoClientSecret(): string | null {
  return process.env.KAKAO_CLIENT_SECRET || null;
}

// redirect_uri 는 접속한 실제 도메인(origin)에서 만든다. 환경변수 미설정으로 인한
// localhost 불일치(KOE006)를 없앤다. origin 미제공 시에만 env/localhost 로 폴백.
export function kakaoRedirectUri(origin?: string): string {
  const base = origin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${KAKAO_REDIRECT_PATH}`;
}

export function kakaoAuthorizeUrl(origin?: string): string {
  const key = kakaoRestKey();
  const params = new URLSearchParams({
    client_id: key ?? "",
    redirect_uri: kakaoRedirectUri(origin),
    response_type: "code",
    scope: KAKAO_SCOPE,
  });
  return `${AUTH}/oauth/authorize?${params.toString()}`;
}

/** 인가 코드를 토큰으로 교환하고 refresh_token 을 저장한다. redirect_uri 는 authorize 때와 동일해야 한다. */
export async function exchangeCodeAndStore(
  code: string,
  origin?: string
): Promise<{ ok: boolean; error?: string }> {
  const key = kakaoRestKey();
  if (!key) return { ok: false, error: "KAKAO_REST_API_KEY 미설정" };

  const exchangeParams: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: key,
    redirect_uri: kakaoRedirectUri(origin),
    code,
  };
  const secret = kakaoClientSecret();
  if (secret) exchangeParams.client_secret = secret;

  const res = await fetch(`${AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(exchangeParams),
  });
  const json = await res.json();
  if (!res.ok || !json.refresh_token) {
    return { ok: false, error: json.error_description || "토큰 교환 실패" };
  }
  await setSetting("kakao_refresh_token", json.refresh_token);
  if (json.access_token) await setSetting("kakao_access_token", json.access_token);
  return { ok: true };
}

async function freshAccessToken(): Promise<string | null> {
  const key = kakaoRestKey();
  const refresh = await getSetting("kakao_refresh_token");
  if (!key || !refresh) return null;

  const refreshParams: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: key,
    refresh_token: refresh,
  };
  const secret = kakaoClientSecret();
  if (secret) refreshParams.client_secret = secret;

  const res = await fetch(`${AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(refreshParams),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) return null;
  // 카카오는 refresh_token 을 가끔 새로 준다 → 갱신
  if (json.refresh_token) await setSetting("kakao_refresh_token", json.refresh_token);
  await setSetting("kakao_access_token", json.access_token);
  return json.access_token as string;
}

export async function isKakaoLinked(): Promise<boolean> {
  return !!(await getSetting("kakao_refresh_token"));
}

/** 대표 카톡으로 텍스트 메시지 전송. */
export async function sendKakaoMemo(
  text: string,
  linkUrl?: string,
  buttonTitle = "열기"
): Promise<{ ok: boolean; error?: string }> {
  const token = await freshAccessToken();
  if (!token) return { ok: false, error: "카카오 미연결(대표 인증 필요)" };

  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  // linkUrl 이 "/todos" 같은 경로면 사이트 주소를 앞에 붙인다.
  const link = !linkUrl
    ? `${site}/dashboard`
    : linkUrl.startsWith("http")
    ? linkUrl
    : `${site}${linkUrl}`;

  const templateObject = {
    object_type: "text",
    text: text.slice(0, 200),
    link: { web_url: link, mobile_web_url: link },
    button_title: buttonTitle,
  };

  const res = await fetch(`${API}/v2/api/talk/memo/default/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `발송 실패: ${t.slice(0, 160)}` };
  }
  return { ok: true };
}

/** '투두 업무 체크하기' 멘트 + 투두 보기 버튼을 발송한다(진행 중 건수 포함). */
export async function sendTodoCheckMemo(): Promise<{ ok: boolean; error?: string }> {
  let n = 0;
  try {
    const { count } = await createSupabaseServiceClient()
      .from("todos")
      .select("id", { count: "exact", head: true })
      .in("status", ["예정", "진행"]);
    n = count ?? 0;
  } catch {
    /* 건수 조회 실패해도 발송은 진행 */
  }
  const text =
    n > 0
      ? `하루바른·나아 운영플랫폼 · 투두 업무 체크하기\n진행 중인 할 일 ${n}건. 오늘 할 일을 확인하세요.`
      : `하루바른·나아 운영플랫폼 · 투두 업무 체크하기\n오늘 할 일을 확인하고 등록하세요.`;
  return sendKakaoMemo(text, "/todos", "투두 보기");
}
