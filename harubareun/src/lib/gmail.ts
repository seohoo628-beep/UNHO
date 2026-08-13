import crypto from "crypto";
import { normalizePrivateKey } from "@/lib/googleKey";

// Gmail 연동 — 서비스계정(JWT) + 도메인 전체 위임(Domain-wide delegation)으로
// 회사 메일함(uc@unocompany.net)을 대신 읽고/보낸다.
//
// 필요 환경변수:
//   GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY  (드라이브 연동과 동일한 서비스계정)
//   GMAIL_USER   : 위임 대상 메일함(기본 uc@unocompany.net)
//
// Google Workspace 관리콘솔 → 보안 → API 제어 → 도메인 전체 위임 에서
// 서비스계정 클라이언트ID에 아래 범위를 허용해야 한다:
//   https://www.googleapis.com/auth/gmail.modify
//   https://www.googleapis.com/auth/gmail.send

const SCOPE = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send";
const DEFAULT_USER = "uc@unocompany.net";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function gmailUser(): string {
  return (process.env.GMAIL_USER || DEFAULT_USER).trim();
}

export function gmailConfigured(): boolean {
  return !!(process.env.GOOGLE_SA_CLIENT_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY);
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SA_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error("서비스계정(GOOGLE_SA_*)이 설정되지 않았습니다.");
  const key = normalizePrivateKey(rawKey);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: email,
    sub: gmailUser(), // 도메인 전체 위임: 이 메일함으로 가장(impersonate)
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(key).toString("base64url");
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = (await res.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!j.access_token) {
    throw new Error(j.error_description || j.error || "구글 토큰 발급 실패(도메인 위임 확인 필요)");
  }
  return j.access_token;
}

export type MailHeader = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string; // 원본 Date 헤더
  ts: number; // 정렬용(ms)
  snippet: string;
  unread: boolean;
};

export type MailAttachment = { filename: string; mimeType: string; attachmentId: string; size: number };

export type MailFull = MailHeader & {
  cc: string;
  bodyHtml: string | null;
  bodyText: string | null;
  messageId: string; // RFC Message-Id 헤더(답장 스레딩용)
  references: string;
  attachments: MailAttachment[];
};

function headerVal(headers: { name: string; value: string }[], name: string): string {
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

async function fetchJson(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, json: json as any, text };
}

// 라벨 목록: INBOX(받은편지함) / SENT(보낸편지함) / "" (전체)
export async function listMessages(opts: {
  label?: string;
  q?: string;
  pageToken?: string;
  max?: number;
}): Promise<{ ok: boolean; messages?: MailHeader[]; nextPageToken?: string; error?: string; needsSetup?: boolean }> {
  try {
    const token = await getAccessToken();
    const max = Math.min(Math.max(opts.max ?? 20, 1), 40);
    const params = new URLSearchParams({ maxResults: String(max) });
    if (opts.label) params.set("labelIds", opts.label);
    if (opts.q) params.set("q", opts.q);
    if (opts.pageToken) params.set("pageToken", opts.pageToken);

    const { res, json, text } = await fetchJson(`${API}/messages?${params.toString()}`, token);
    if (!res.ok) {
      const needsSetup = res.status === 403 || res.status === 401;
      return { ok: false, error: `메일 목록 조회 실패(${res.status}): ${text.slice(0, 200)}`, needsSetup };
    }
    const ids: { id: string; threadId: string }[] = json?.messages ?? [];
    const nextPageToken: string | undefined = json?.nextPageToken;
    if (ids.length === 0) return { ok: true, messages: [], nextPageToken };

    // 각 메시지 메타데이터 병렬 조회.
    const metas = await Promise.all(
      ids.map(async (m) => {
        const mp = new URLSearchParams({ format: "metadata" });
        mp.append("metadataHeaders", "From");
        mp.append("metadataHeaders", "To");
        mp.append("metadataHeaders", "Subject");
        mp.append("metadataHeaders", "Date");
        const r = await fetchJson(`${API}/messages/${m.id}?${mp.toString()}`, token);
        if (!r.res.ok) return null;
        const d = r.json;
        const hs = (d?.payload?.headers ?? []) as { name: string; value: string }[];
        const internal = Number(d?.internalDate ?? 0);
        return {
          id: d.id,
          threadId: d.threadId,
          from: headerVal(hs, "From"),
          to: headerVal(hs, "To"),
          subject: headerVal(hs, "Subject") || "(제목 없음)",
          date: headerVal(hs, "Date"),
          ts: internal,
          snippet: decodeEntities(d?.snippet ?? ""),
          unread: Array.isArray(d?.labelIds) && d.labelIds.includes("UNREAD"),
        } as MailHeader;
      })
    );
    const messages = metas.filter(Boolean) as MailHeader[];
    messages.sort((a, b) => b.ts - a.ts);
    return { ok: true, messages, nextPageToken };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "메일 조회 실패", needsSetup: true };
  }
}

type Part = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: Part[];
};

function walkParts(part: Part, out: { html: string[]; text: string[]; atts: MailAttachment[] }) {
  if (!part) return;
  const mime = part.mimeType || "";
  if (part.filename && part.body?.attachmentId) {
    out.atts.push({
      filename: part.filename,
      mimeType: mime,
      attachmentId: part.body.attachmentId,
      size: part.body.size ?? 0,
    });
  }
  if (mime === "text/html" && part.body?.data) {
    out.html.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
  } else if (mime === "text/plain" && part.body?.data && !part.filename) {
    out.text.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
  }
  for (const p of part.parts ?? []) walkParts(p, out);
}

export async function getMessage(
  id: string
): Promise<{ ok: boolean; message?: MailFull; error?: string }> {
  try {
    const token = await getAccessToken();
    const { res, json, text } = await fetchJson(`${API}/messages/${id}?format=full`, token);
    if (!res.ok) return { ok: false, error: `메일 조회 실패(${res.status}): ${text.slice(0, 200)}` };
    const hs = (json?.payload?.headers ?? []) as { name: string; value: string }[];
    const acc = { html: [] as string[], text: [] as string[], atts: [] as MailAttachment[] };
    if (json?.payload) walkParts(json.payload as Part, acc);
    const full: MailFull = {
      id: json.id,
      threadId: json.threadId,
      from: headerVal(hs, "From"),
      to: headerVal(hs, "To"),
      cc: headerVal(hs, "Cc"),
      subject: headerVal(hs, "Subject") || "(제목 없음)",
      date: headerVal(hs, "Date"),
      ts: Number(json?.internalDate ?? 0),
      snippet: decodeEntities(json?.snippet ?? ""),
      unread: Array.isArray(json?.labelIds) && json.labelIds.includes("UNREAD"),
      messageId: headerVal(hs, "Message-Id") || headerVal(hs, "Message-ID"),
      references: headerVal(hs, "References"),
      bodyHtml: acc.html.length ? acc.html.join("\n") : null,
      bodyText: acc.text.length ? acc.text.join("\n") : null,
      attachments: acc.atts,
    };
    return { ok: true, message: full };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "메일 조회 실패" };
  }
}

export async function markRead(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await getAccessToken();
    const { res } = await fetchJson(`${API}/messages/${id}/modify`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `읽음 처리 실패(${res.status})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "읽음 처리 실패" };
  }
}

function encodeSubject(s: string): string {
  // RFC 2047 (한글 제목 대응)
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function chunk76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trim();
}

// 라벨 이름 → id (없으면 생성). 실패 시 null.
export async function ensureLabel(name: string): Promise<string | null> {
  try {
    const token = await getAccessToken();
    const list = await fetchJson(`${API}/labels`, token);
    if (list.res.ok) {
      const found = (list.json?.labels ?? []).find(
        (l: { id: string; name: string }) => l.name === name
      );
      if (found) return found.id as string;
    }
    const created = await fetchJson(`${API}/labels`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
    });
    return created.res.ok ? (created.json?.id as string) : null;
  } catch {
    return null;
  }
}

export async function addLabels(messageId: string, labelIds: string[]): Promise<boolean> {
  try {
    const token = await getAccessToken();
    const { res } = await fetchJson(`${API}/messages/${messageId}/modify`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addLabelIds: labelIds }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendMessage(opts: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string; // 본문(일반 텍스트)
  html?: string; // HTML 본문(있으면 multipart/alternative)
  fromName?: string;
  threadId?: string;
  inReplyTo?: string; // 답장 대상 Message-Id
  references?: string;
}): Promise<{ ok: boolean; id?: string; error?: string; needsSetup?: boolean }> {
  try {
    if (!opts.to?.trim()) return { ok: false, error: "받는 사람을 입력하세요." };
    const token = await getAccessToken();
    const fromName = opts.fromName?.trim();
    const fromHeader = fromName ? `${encodeSubject(fromName)} <${gmailUser()}>` : gmailUser();

    const head: string[] = [];
    head.push(`From: ${fromHeader}`);
    head.push(`To: ${opts.to.trim()}`);
    if (opts.cc?.trim()) head.push(`Cc: ${opts.cc.trim()}`);
    if (opts.bcc?.trim()) head.push(`Bcc: ${opts.bcc.trim()}`);
    head.push(`Subject: ${encodeSubject(opts.subject || "(제목 없음)")}`);
    if (opts.inReplyTo) {
      head.push(`In-Reply-To: ${opts.inReplyTo}`);
      head.push(`References: ${opts.references ? opts.references + " " : ""}${opts.inReplyTo}`);
    }
    head.push("MIME-Version: 1.0");

    const b64 = (s: string) => chunk76(Buffer.from(s ?? "", "utf8").toString("base64"));
    let mime: string;
    if (opts.html) {
      // multipart/alternative (텍스트 + HTML)
      const boundary = "uc_" + opts.subject.length + "_" + (opts.body?.length ?? 0) + "b";
      const parts = [
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        b64(opts.body || opts.html.replace(/<[^>]+>/g, "")),
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        b64(opts.html),
        `--${boundary}--`,
      ];
      mime = [...head, `Content-Type: multipart/alternative; boundary="${boundary}"`, "", ...parts].join("\r\n");
    } else {
      mime = [...head, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(opts.body)].join("\r\n");
    }
    const raw = b64url(mime);

    const payload: Record<string, unknown> = { raw };
    if (opts.threadId) payload.threadId = opts.threadId;

    const { res, json, text } = await fetchJson(`${API}/messages/send`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const needsSetup = res.status === 403 || res.status === 401;
      return { ok: false, error: `메일 발송 실패(${res.status}): ${text.slice(0, 200)}`, needsSetup };
    }
    return { ok: true, id: json?.id as string | undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "메일 발송 실패", needsSetup: true };
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
