"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { getAnthropic, getAnthropicKey, createMessageWithFallback } from "@/lib/anthropic";

type Result = { ok: boolean; message?: string };

// 키 저장 (대표 전용). 환경변수가 이미 있으면 그게 우선한다.
export async function saveAnthropicKey(key: string): Promise<Result> {
  const u = await requireAppUser();
  if (u.role !== "owner") return { ok: false, message: "대표만 설정할 수 있습니다." };

  const trimmed = (key || "").trim();
  if (trimmed && !trimmed.startsWith("sk-ant-")) {
    return { ok: false, message: "키 형식이 올바르지 않습니다. (sk-ant- 로 시작해야 합니다)" };
  }
  await setSetting("anthropic_api_key", trimmed || null);
  revalidatePath("/settings");
  return { ok: true, message: trimmed ? "키가 저장되었습니다. ‘연결 테스트’로 확인하세요." : "키가 삭제되었습니다." };
}

// ── OpenAI (음성 텍스트 변환 Whisper) ──
export async function saveOpenAIKey(key: string): Promise<Result> {
  const u = await requireAppUser();
  if (u.role !== "owner") return { ok: false, message: "대표만 설정할 수 있습니다." };
  const trimmed = (key || "").trim();
  if (trimmed && !trimmed.startsWith("sk-")) {
    return { ok: false, message: "키 형식이 올바르지 않습니다. (sk- 로 시작해야 합니다)" };
  }
  await setSetting("openai_api_key", trimmed || null);
  revalidatePath("/settings");
  return { ok: true, message: trimmed ? "키가 저장되었습니다. ‘연결 테스트’로 확인하세요." : "키가 삭제되었습니다." };
}

export async function testOpenAI(): Promise<Result> {
  const u = await requireAppUser();
  if (u.role !== "owner") return { ok: false, message: "대표만 가능합니다." };
  const { getOpenAIKey } = await import("@/lib/transcribe");
  const key = await getOpenAIKey();
  if (!key) return { ok: false, message: "저장된 키가 없습니다. 먼저 키를 입력·저장하세요." };
  try {
    const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return { ok: false, message: `연결 실패(${res.status}). 키를 확인하세요.` };
    return { ok: true, message: "연결 성공 · 음성 텍스트 변환(Whisper) 사용 가능" };
  } catch (e: any) {
    return { ok: false, message: `연결 실패: ${e?.message || e}` };
  }
}

// 실제 호출로 연결 확인
export async function testAnthropic(): Promise<Result> {
  const u = await requireAppUser();
  if (u.role !== "owner") return { ok: false, message: "대표만 가능합니다." };
  if (!(await getAnthropicKey())) return { ok: false, message: "저장된 키가 없습니다. 먼저 키를 입력·저장하세요." };
  try {
    const anthropic = await getAnthropic();
    const { model } = await createMessageWithFallback(anthropic, {
      max_tokens: 8,
      messages: [{ role: "user", content: "핑" }],
    });
    return { ok: true, message: `연결 성공 · 사용 모델: ${model}` };
  } catch (e: any) {
    return { ok: false, message: `연결 실패: ${e?.message || e}` };
  }
}
