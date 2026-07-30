import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import { HARD_RULES, brandBrief, extractText, seoulMMDD } from "@/lib/agents/common";
import type { Brand } from "@/lib/types";

// ============================================================================
// 디자이너 에이전트 (요청 시 실행)
// 산출: 상세페이지 구성안·카피, 배너·썸네일 레이아웃 지시서, 제품소개서·제안서 슬라이드 구조.
// 규칙: 서체는 전 브랜드 Pretendard 단일. 이미지 자체를 생성하지 않는다 —
//       기존 제품컷을 어떻게 배치할지의 지시서까지가 범위다.
// ============================================================================

export type DesignerContext = {
  productShots?: string | null; // 기존 제품컷 목록
  deliverable?: "detail" | "banner" | "deck"; // 요청 산출 유형
};

const LABEL: Record<string, string> = {
  detail: "상세페이지",
  banner: "배너·썸네일",
  deck: "제품소개서·제안서 슬라이드",
};

export function buildDesignerPrompt(brand: Brand, ctx: DesignerContext = {}) {
  const system = `너는 운호컴퍼니의 디자이너 에이전트다. 디자인 지시서를 만든다. 이미지를 직접 생성하지 않는다.
서체는 전 브랜드 Pretendard 단일 체계다. 브랜드마다 다른 폰트를 지정하지 않는다.
${HARD_RULES}`;

  const focus = ctx.deliverable ? LABEL[ctx.deliverable] : "상세페이지·배너·슬라이드 전반";

  const user = `${brandBrief(brand)}
[기존 제품컷 목록] ${ctx.productShots ?? "미제공 — 필요한 컷을 '확인 필요'로 표기"}
[요청 산출] ${focus}

다음을 작성한다. 이미지를 만들지 말고, 기존 제품컷을 어떻게 배치할지의 지시서까지만.

1. 상세페이지 구성안 (섹션 순서, 각 섹션 목적, 배치할 제품컷, 카피)
2. 배너·썸네일 레이아웃 지시서 (사이즈, 요소 배치, VI 팔레트 적용, 서체 Pretendard 위계)
3. 제품소개서·제안서 슬라이드 구조 (슬라이드별 제목과 담을 내용)

VI 팔레트(주색·보조·강조·배경)를 어디에 쓸지 구체적으로 지시한다. 출력은 위 번호 구조를 따른 평문.`;

  return { system, user };
}

export async function generateDesignerOutput(brand: Brand, ctx: DesignerContext = {}) {
  const { system, user } = buildDesignerPrompt(brand, ctx);
  const anthropic = getAnthropic();
  const { msg, model } = await createMessageWithFallback(anthropic, {
    max_tokens: 2400,
    system,
    messages: [{ role: "user", content: user }],
  });
  return {
    title: `${brand.name} 디자인 지시서 (${seoulMMDD()})`,
    body: extractText(msg),
    inputPrompt: `[system]\n${system}\n\n[user]\n${user}`,
    model,
  };
}
