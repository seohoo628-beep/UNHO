"use server";

import crypto from "crypto";
import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { getSetting } from "@/lib/settings";

// 솔라피(Solapi) 문자 발송 연동. 키·발신번호는 환경변수 또는 설정(app_settings)에서 읽는다.
// 키가 없으면 실제 발송하지 않고 설정 안내를 반환(웹만으로는 통신사 발송 불가).

export type SmsResult = { ok: boolean; sent?: number; failed?: number; error?: string; needsSetup?: boolean };

async function smsConfig() {
  const key = process.env.SOLAPI_API_KEY || (await getSetting("solapi_api_key"));
  const secret = process.env.SOLAPI_API_SECRET || (await getSetting("solapi_api_secret"));
  const from = process.env.SMS_FROM || (await getSetting("sms_from"));
  return { key: key?.trim() || "", secret: secret?.trim() || "", from: (from || "").replace(/[^\d]/g, "") };
}

function onlyDigits(s: string): string {
  return String(s || "").replace(/[^\d]/g, "");
}

// 대량 문자 발송(90byte 초과 시 자동 LMS). 대표/직원만.
export async function sendBulkSms(numbers: string[], text: string): Promise<SmsResult> {
  try {
    const user = await requireAppUser();
    if (!(isCeoUser(user) || user.role === "owner" || user.role === "staff")) return { ok: false, error: "권한이 없습니다." };
  } catch { return { ok: false, error: "로그인이 필요합니다." }; }

  const body = (text || "").trim();
  if (!body) return { ok: false, error: "메시지 내용을 입력하세요." };
  const to = Array.from(new Set((numbers || []).map(onlyDigits).filter((n) => n.length >= 9))).slice(0, 1000);
  if (!to.length) return { ok: false, error: "보낼 번호가 없습니다." };

  const { key, secret, from } = await smsConfig();
  if (!key || !secret || !from) {
    return { ok: false, needsSetup: true, error: "문자 발송 설정이 없습니다. 설정에서 SOLAPI API 키·시크릿·발신번호(사전등록 번호)를 등록하면 서버에서 바로 발송됩니다. 그 전까지는 ‘문자앱으로 보내기’를 이용하세요." };
  }

  // HMAC-SHA256 인증 헤더.
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
    if (!res.ok) {
      return { ok: false, error: `발송 실패: ${data?.errorMessage || data?.message || res.status}` };
    }
    const cnt = data?.groupInfo?.count ?? {};
    const sent = Number(cnt?.registeredSuccess ?? messages.length) || 0;
    const failed = Number(cnt?.registeredFailed ?? 0) || 0;
    return { ok: true, sent, failed };
  } catch (e: any) {
    return { ok: false, error: `발송 오류: ${e?.message || String(e)}` };
  }
}
