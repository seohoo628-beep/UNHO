"use server";

import { requireAppUser } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";
import { sendSmsCore, type SmsSendResult } from "@/lib/sms";

// 솔라피(Solapi) 문자 발송 — 화면용 서버 액션(권한 검사 포함).
// 발송 코어는 src/lib/sms.ts(권한 검사 없음, 서버 내부 전용)로 분리.

export type SmsResult = SmsSendResult;

// 대량 문자 발송(90byte 초과 시 자동 LMS). 대표/직원만.
export async function sendBulkSms(numbers: string[], text: string): Promise<SmsResult> {
  try {
    const user = await requireAppUser();
    if (!(isCeoUser(user) || user.role === "owner" || user.role === "staff")) return { ok: false, error: "권한이 없습니다." };
  } catch { return { ok: false, error: "로그인이 필요합니다." }; }

  const r = await sendSmsCore(numbers, text);
  if (r.needsSetup) {
    return { ...r, error: "문자 발송 설정이 없습니다. 설정에서 SOLAPI API 키·시크릿·발신번호(사전등록 번호)를 등록하면 서버에서 바로 발송됩니다. 그 전까지는 ‘문자앱으로 보내기’를 이용하세요." };
  }
  return r;
}
