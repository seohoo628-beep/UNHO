import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import type { Brand } from "@/lib/types";

// ============================================================================
// 마케터 에이전트
// 실행 시 해당 브랜드의 카테고리·규제 근거·VI 팔레트·톤 3줄을 DB에서 읽어
// 프롬프트를 조립한다. 브랜드 구분 없는 문장이 나오면 실패다.
//
// 산출: 인스타 릴스 대본(후킹 3안·컷 구성·자막·촬영 디렉션), 피드 카피,
//       업로드 카피와 해시태그.
// ============================================================================

export type MarketerContext = {
  promo?: string | null; // 진행 중 프로모션
  topContent?: string | null; // 최근 30일 성과 상위 콘텐츠 요약
};

const HARD_RULES = `절대 규칙:
- 금액을 만들지 않는다. 단가·할인가·수수료·예산 자리는 반드시 [   ]로 비우고, 문서 말미 "확인 필요" 목록에 올린다.
- 대외 발송 문구를 완성하지 않는다. 초안까지만 쓴다.
- 보장·전액 책임·무조건 같은 무한책임 표현을 쓰지 않는다.
- 이모지를 쓰지 않는다.
- "해보세요", "놀랍게도", "지금 바로", 과도한 느낌표, "다양한", "최고의", "혁신적인" 같은 상투구·빈 수식어를 쓰지 않는다.
- 근거 없는 최상급·절대 표현을 쓰지 않는다. 형용사보다 숫자.
- 규제 근거를 벗어나는 효능·기능성·질병 관련 표현을 쓰지 않는다.`;

export function buildMarketerPrompt(
  brand: Brand,
  ctx: MarketerContext = {}
): { system: string; user: string } {
  const palette = [
    brand.vi_primary && `주색 ${brand.vi_primary}`,
    brand.vi_secondary && `보조색 ${brand.vi_secondary}`,
    brand.vi_accent && `강조색 ${brand.vi_accent}`,
    brand.vi_bg && `배경 ${brand.vi_bg}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const system = `너는 운호컴퍼니의 마케터 에이전트다. 브랜드 하나에 대한 인스타그램 릴스·피드 콘텐츠 초안을 만든다.
계정마다 톤과 구조가 다르므로 반드시 아래 지정된 브랜드 기준으로만 쓴다. 브랜드 구분이 없는 일반론은 실패다.
${HARD_RULES}`;

  const user = `[브랜드] ${brand.name} (${brand.slug})
[카테고리] ${brand.category ?? "-"}
[표시광고 규제 근거] ${brand.regulation ?? "-"}
[톤 3줄] ${brand.tone ?? "-"}
[VI 팔레트] ${palette || "-"}
[서체] 국문 ${brand.font_ko} / 영문 ${brand.font_en}
[대표 제품] ${brand.flagship ?? "-"}
[채널] ${brand.channel ?? "-"}
[진행 중 프로모션] ${ctx.promo ?? "없음"}
[최근 30일 성과 상위 콘텐츠] ${ctx.topContent ?? "데이터 없음"}

위 브랜드 기준으로 다음을 작성한다. 규제 근거를 벗어나는 표현은 쓰지 않는다.

1. 릴스 대본
   - 후킹 3안 (서로 다른 각도)
   - 컷 구성 (컷별 화면·길이)
   - 자막 (컷별)
   - 촬영 디렉션 (앵글·조명·소품, VI 팔레트 반영)
2. 피드 카피 (2~3문단)
3. 업로드 카피와 해시태그 (해시태그 8~12개)

출력은 위 번호 구조를 그대로 따른 평문으로 한다. 마크다운 표는 쓰지 않아도 된다.`;

  return { system, user };
}

export async function generateMarketerOutput(
  brand: Brand,
  ctx: MarketerContext = {}
): Promise<{ title: string; body: string; inputPrompt: string; model: string }> {
  const { system, user } = buildMarketerPrompt(brand, ctx);
  const anthropic = getAnthropic();

  const { msg, model } = await createMessageWithFallback(anthropic, {
    max_tokens: 2400,
    system,
    messages: [{ role: "user", content: user }],
  });

  const body = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const today = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return {
    title: `${brand.name} 릴스·피드 초안 (${today})`,
    body,
    inputPrompt: `[system]\n${system}\n\n[user]\n${user}`,
    model,
  };
}
