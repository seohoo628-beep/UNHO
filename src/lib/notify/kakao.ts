import { getSetting, setSetting } from "@/lib/settings";

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

export function kakaoRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${KAKAO_REDIRECT_PATH}`;
}

export function kakaoAuthorizeUrl(): string {
  const key = kakaoRestKey();
  const params = new URLSearchParams({
    client_id: key ?? "",
    redirect_uri: kakaoRedirectUri(),
    response_type: "code",
    scope: KAKAO_SCOPE,
  });
  return `${AUTH}/oauth/authorize?${params.toString()}`;
}

/** 인가 코드를 토큰으로 교환하고 refresh_token 을 저장한다. */
export async function exchangeCodeAndStore(code: string): Promise<{ ok: boolean; error?: string }> {
  const key = kakaoRestKey();
  if (!key) return { ok: false, error: "KAKAO_REST_API_KEY 미설정" };

  const res = await fetch(`${AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: key,
      redirect_uri: kakaoRedirectUri(),
      code,
    }),
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

  const res = await fetch(`${AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: key,
      refresh_token: refresh,
    }),
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
  linkUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  const token = await freshAccessToken();
  if (!token) return { ok: false, error: "카카오 미연결(대표 인증 필요)" };

  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const link = linkUrl || `${site}/dashboard`;

  const templateObject = {
    object_type: "text",
    text: text.slice(0, 200),
    link: { web_url: link, mobile_web_url: link },
    button_title: "열기",
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
