// 개인 지메일(예: seohoo628@gmail.com) OAuth 연동.
// 서비스계정 도메인 위임이 안 되는 개인 gmail을 읽기 위해 사용자 동의(OAuth) 기반 refresh token 사용.
//
// 환경변수:
//   GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET  (Google Cloud OAuth 클라이언트)
//   GMAIL_OAUTH_REFRESH_TOKEN  (/api/gmail-oauth/start 동의 후 발급되어 저장)

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function personalGmailConfigured(): boolean {
  return !!(process.env.GMAIL_OAUTH_CLIENT_ID && process.env.GMAIL_OAUTH_CLIENT_SECRET && process.env.GMAIL_OAUTH_REFRESH_TOKEN);
}

export function oauthClientReady(): boolean {
  return !!(process.env.GMAIL_OAUTH_CLIENT_ID && process.env.GMAIL_OAUTH_CLIENT_SECRET);
}

async function accessTokenFromRefresh(): Promise<string | null> {
  const client_id = process.env.GMAIL_OAUTH_CLIENT_ID;
  const client_secret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refresh_token = process.env.GMAIL_OAUTH_REFRESH_TOKEN;
  if (!client_id || !client_secret || !refresh_token) return null;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" }),
  });
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

// 인가 코드 → refresh token 교환(콜백에서 사용).
export async function exchangeCode(code: string, redirectUri: string): Promise<{ ok: boolean; refreshToken?: string; error?: string }> {
  const client_id = process.env.GMAIL_OAUTH_CLIENT_ID;
  const client_secret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  if (!client_id || !client_secret) return { ok: false, error: "GMAIL_OAUTH_CLIENT_ID/SECRET 미설정" };
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id, client_secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const j = (await res.json()) as { refresh_token?: string; error?: string; error_description?: string };
  if (!j.refresh_token) return { ok: false, error: j.error_description || j.error || "refresh token 없음(동의 화면에서 access_type=offline·prompt=consent 필요)" };
  return { ok: true, refreshToken: j.refresh_token };
}

export type NeedReplyMail = { subject: string; from: string; id: string };

export async function listNeedReply(q: string, max = 6): Promise<NeedReplyMail[]> {
  const token = await accessTokenFromRefresh();
  if (!token) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal, cache: "no-store" }
    );
    const listJson = (await listRes.json()) as { messages?: { id: string }[] };
    const ids = (listJson.messages ?? []).slice(0, max);
    const out: NeedReplyMail[] = [];
    for (const m of ids) {
      const d = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      const j = (await d.json()) as { payload?: { headers?: { name: string; value: string }[] } };
      const h = j.payload?.headers ?? [];
      const subject = h.find((x) => x.name.toLowerCase() === "subject")?.value ?? "(제목 없음)";
      const from = h.find((x) => x.name.toLowerCase() === "from")?.value ?? "";
      out.push({ subject, from: from.replace(/<[^>]+>/, "").trim() || from, id: m.id });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
