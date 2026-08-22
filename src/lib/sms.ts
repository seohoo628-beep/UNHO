import crypto from "crypto";
import { getSetting } from "@/lib/settings";

// 솔라피(Solapi) 문자 발송 코어 — 서버 내부 전용(권한 검사 없음).
// 화면에서 쓰는 서버 액션은 smsActions.ts(권한 검사 포함)를 사용할 것.

export type SmsSendResult = { ok: boolean; sent?: number; failed?: number; error?: string; needsSetup?: boolean };

export async function smsConfig() {
  const key = process.env.SOLAPI_API_KEY || (await getSetting("solapi_api_key"));
  const secret = process.env.SOLAPI_API_SECRET || (await getSetting("solapi_api_secret"));
  const from = process.env.SMS_FROM || (await getSetting("sms_from"));
  return { key: key?.trim() || "", secret: secret?.trim() || "", from: (from || "").replace(/[^\d]/g, "") };
}

export function onlyDigits(s: string): string {
  return String(s || "").replace(/[^\d]/g, "");
}

// 대량 문자 발송(90byte 초과 시 자동 LMS). 호출자가 권한을 책임진다.
export async function sendSmsCore(numbers: string[], text: string): Promise<SmsSendResult> {
  const body = (text || "").trim();
  if (!body) return { ok: false, error: "메시지 내용이 비었습니다." };
  const to = Array.from(new Set((numbers || []).map(onlyDigits).filter((n) => n.length >= 9))).slice(0, 1000);
  if (!to.length) return { ok: false, error: "보낼 번호가 없습니다." };

  const { key, secret, from } = await smsConfig();
  if (!key || !secret || !from) return { ok: false, needsSetup: true, error: "문자 발송 설정(SOLAPI 키·발신번호)이 없습니다." };

  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(date + salt).digest("hex");
  const auth = `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;

  const isLong = Buffer.byteLength(body, "utf8") > 90;
  const messages = to.map((t) => ({ to: t, from, text: body, type: isLong ? "LMS" : "SMS" }));

  try {
    const res = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ messages }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `발송 실패: ${data?.errorMessage || data?.message || res.status}` };
    const cnt = data?.groupInfo?.count ?? {};
    const sent = Number(cnt?.registeredSuccess ?? messages.length) || 0;
    const failed = Number(cnt?.registeredFailed ?? 0) || 0;
    return { ok: true, sent, failed };
  } catch (e: any) {
    return { ok: false, error: `발송 오류: ${e?.message || String(e)}` };
  }
}
