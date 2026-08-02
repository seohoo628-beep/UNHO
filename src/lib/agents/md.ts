import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import { HARD_RULES, brandBrief, extractText, seoulMMDD } from "@/lib/agents/common";
import type { Brand } from "@/lib/types";

// ============================================================================
// MD 에이전트
// 산출: 셀러·인플루언서 후보 검증 결과, 제품 매칭과 매칭 사유, 제안 메일·DM 초안,
//       입점 제안서 초안.
// 검증 규칙: 기관·브랜드 공식 채널, 댓글 0~3개 저활동 채널을 거른다.
//   우선순위 = 커머스 이력 > 댓글 참여도 > 조회율 > 구독자 수. 구독자 수를 1순위로 두지 않는다.
//   제품별 하루 최대 2명.
// ============================================================================

export type MdContext = {
  sellerData?: string | null; // 셀러 관리 시트 요약(있으면)
  products?: string | null; // 제품 목록
};

export function buildMdPrompt(brand: Brand, ctx: MdContext = {}) {
  const system = `너는 운호컴퍼니의 MD 에이전트다. 공동구매 셀러·인플루언서 발굴과 제품 매칭 초안을 만든다.
${HARD_RULES}`;

  const user = `${brandBrief(brand)}
[셀러 후보 데이터] ${ctx.sellerData ?? "연동 데이터 없음 — 후보가 주어지지 않으면 '후보 데이터 필요'로 표기하고 검증 기준만 제시한다"}
[제품 목록] ${ctx.products ?? brand.flagship ?? "-"}

다음을 작성한다.

1. 후보 검증 결과
   - 기관·브랜드 공식 채널, 댓글 0~3개 저활동 채널은 제외 사유와 함께 걸러낸다
   - 선별 우선순위: 커머스 이력 > 댓글 참여도 > 조회율 > 구독자 수 (구독자 수를 1순위로 두지 않는다)
2. 제품 매칭과 매칭 사유 (제품별 최대 2명. 특정 제품 쏠림 금지)
3. 제안 메일 초안 (초안까지만. 금액 자리는 [   ])
4. 제안 DM 초안
5. 입점 제안서 목차 초안

출력은 위 번호 구조를 따른 평문으로 한다.`;

  return { system, user };
}

export async function generateMdOutput(brand: Brand, ctx: MdContext = {}) {
  const { system, user } = buildMdPrompt(brand, ctx);
  const anthropic = await getAnthropic();
  const { msg, model } = await createMessageWithFallback(anthropic, {
    max_tokens: 2400,
    system,
    messages: [{ role: "user", content: user }],
  });
  return {
    title: `${brand.name} 셀러 매칭·제안 초안 (${seoulMMDD()})`,
    body: extractText(msg),
    inputPrompt: `[system]\n${system}\n\n[user]\n${user}`,
    model,
  };
}
