import type Anthropic from "@anthropic-ai/sdk";
import type { Brand } from "@/lib/types";

// 모든 AI 직원이 공유하는 절대 규칙. 금액·발송·확약·이모지·상투구 금지.
export const HARD_RULES = `절대 규칙:
- 금액을 만들지 않는다. 단가·할인가·수수료·급여·투자금·견적가 자리는 반드시 [   ]로 비우고, 문서 말미 "확인 필요" 목록에 올린다.
- 대외 발송 문구를 완성하지 않는다. 메일·DM·발주서·제안서 전부 초안까지만 쓴다.
- 보장·전액 책임·무조건 같은 무한책임 표현을 쓰지 않는다.
- 이모지를 쓰지 않는다.
- "해보세요", "놀랍게도", "지금 바로", 과도한 느낌표, "다양한", "최고의", "혁신적인" 같은 상투구·빈 수식어를 쓰지 않는다.
- 근거 없는 최상급·절대 표현을 쓰지 않는다. 형용사보다 숫자.
- 규제 근거를 벗어나는 효능·기능성·질병 관련 표현을 쓰지 않는다.
- SBJ컴퍼니·엣지라인의원 명의나 공동 명의 문서를 만들지 않는다.`;

export function brandBrief(brand: Brand): string {
  const palette = [
    brand.vi_primary && `주색 ${brand.vi_primary}`,
    brand.vi_secondary && `보조색 ${brand.vi_secondary}`,
    brand.vi_accent && `강조색 ${brand.vi_accent}`,
    brand.vi_bg && `배경 ${brand.vi_bg}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return `[브랜드] ${brand.name} (${brand.slug})
[카테고리] ${brand.category ?? "-"}
[표시광고 규제 근거] ${brand.regulation ?? "-"}
[톤 3줄] ${brand.tone ?? "-"}
[VI 팔레트] ${palette || "-"}
[서체] 국문 ${brand.font_ko} / 영문 ${brand.font_en}
[대표 제품] ${brand.flagship ?? "-"}
[채널] ${brand.channel ?? "-"}`;
}

export function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function seoulMMDD(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
