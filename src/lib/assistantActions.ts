"use server";

import { requireAppUser } from "@/lib/auth";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";

export type ChatMsg = { role: "user" | "assistant"; content: string };

// 전 페이지 공용 AI 어시스턴트. 현재 화면(page)을 맥락으로 받아 한국어로 답한다.
export async function askAssistant(
  history: ChatMsg[],
  page?: string
): Promise<{ ok: boolean; text?: string; error?: string }> {
  let user;
  try {
    user = await requireAppUser();
  } catch {
    return { ok: false, error: "로그인이 필요합니다." };
  }
  try {
    const anthropic = await getAnthropic();
    const system = `당신은 운호컴퍼니 내부 운영 플랫폼의 AI 어시스턴트입니다.
사용자: ${user.name ?? "직원"} (${user.role}). 현재 보고 있는 화면: ${page || "알 수 없음"}.
회사 사업: 화장품(리앤밤·뷰티밤), 건강기능식품·식품(주당의비결·슈퍼릴라), 외식(대운목장·신미집·청담 오리닭), 의료(엣지라인), 유통·커머스.
지침:
- 한국어로 간결하고 실용적으로 답합니다. 필요하면 표·목록·단계로 정리합니다.
- 업무 초안(문자·메일·기획·카피), 요약, 번역, 아이디어, 분석 등을 돕습니다.
- 표시광고 규제상 화장품·건기식의 과장·의학적 효능 단정(질병 치료·예방 등)은 피하고 표현을 순화합니다.
- 모르면 모른다고 하고, 추측이면 추측임을 밝힙니다. 플랫폼의 실제 저장 데이터를 직접 조회할 수는 없으니, 필요한 내용은 사용자에게 붙여넣어 달라고 요청합니다.`;
    const messages = (history || [])
      .filter((m) => m && m.content && m.content.trim())
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));
    if (!messages.length) return { ok: false, error: "메시지가 없습니다." };

    const { msg } = await createMessageWithFallback(anthropic, {
      max_tokens: 1600,
      system,
      messages: messages as any,
    });
    const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    return { ok: true, text: text || "(응답이 비어 있습니다)" };
  } catch (e: any) {
    const m = e?.message || String(e);
    if (/ANTHROPIC|api key|API 키/i.test(m)) return { ok: false, error: "AI 키가 설정되지 않았습니다. 설정 화면에서 ANTHROPIC 키를 등록해 주세요." };
    return { ok: false, error: `AI 오류: ${m}` };
  }
}
