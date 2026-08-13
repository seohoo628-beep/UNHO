import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import type { Brand } from "@/lib/types";

// ============================================================================
// 집행 콘텐츠 생성기
// 승인된 원문(초안)과 브랜드의 "실제 업로드 제품컷" 목록을 받아,
// 바로 게시할 수 있는 최종 콘텐츠(문구·해시태그·컷 배치)를 만든다.
// 이미지는 생성하지 않는다 — 실제 제품컷을 순서만 지정해 붙인다.
// ============================================================================

const HARD_RULES = `절대 규칙:
- 금액을 만들지 않는다. 단가·할인가·수수료 자리는 [   ]로 비운다.
- 대외로 나가는 최종 문구지만, 금액·수치는 근거 없이 채우지 않는다.
- 보장·전액 책임·무조건 등 무한책임 표현 금지.
- 이모지, 과장 상투구("놀랍게도","지금 바로","최고의","혁신적인") 금지.
- 규제 근거를 벗어나는 효능·기능성·질병 표현 금지. 형용사보다 사실·숫자.
- 제품컷 배치는 반드시 아래 제공된 실제 컷 목록 안에서만 지정한다(없는 컷을 지어내지 않는다).`;

export async function generateExecutionContent(
  brand: Brand,
  approvedDraft: string,
  shots: { label: string | null; file_name: string | null }[]
): Promise<{ content: string; model: string }> {
  const shotList =
    shots.length > 0
      ? shots.map((s, i) => `${i + 1}. ${s.label || s.file_name || `컷${i + 1}`}`).join("\n")
      : "(업로드된 제품컷 없음 — 컷 배치는 생략하고 문구만 작성)";

  const system = `너는 하루바른·나아의 콘텐츠 집행 담당이다. 승인된 초안을 실제 게시 가능한 최종본으로 다듬는다.
계정마다 톤이 다르므로 아래 브랜드 기준으로만 쓴다.
${HARD_RULES}`;

  const user = `[브랜드] ${brand.name} (${brand.slug})
[카테고리] ${brand.category ?? "-"}
[표시광고 규제 근거] ${brand.regulation ?? "-"}
[톤 3줄] ${brand.tone ?? "-"}
[채널] ${brand.channel ?? "-"}

[승인된 초안]
${approvedDraft || "(초안 본문 없음)"}

[업로드된 실제 제품컷 목록]
${shotList}

위를 바탕으로 "바로 게시할 최종 콘텐츠"를 아래 구조로 만든다.

1. 게시 문구 (복사해서 그대로 올릴 수 있는 완성 문장. 줄바꿈 포함)
2. 해시태그 (8~12개, 브랜드·카테고리 적합)
3. 제품컷 배치 (위 컷 목록의 번호로, 몇 번째 슬라이드에 어떤 컷을 쓸지 순서 지정)
4. 게시 체크 (게시 전 사람이 확인할 것 1~3줄. 금액/재고/링크 등)

평문으로 위 번호 구조를 따른다.`;

  const anthropic = await getAnthropic();
  const { msg, model } = await createMessageWithFallback(anthropic, {
    max_tokens: 1800,
    system,
    messages: [{ role: "user", content: user }],
  });

  const content = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return { content, model };
}
