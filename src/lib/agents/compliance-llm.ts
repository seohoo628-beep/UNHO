import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import type { Brand, ComplianceFinding } from "@/lib/types";

// 규제 검수 2차 — LLM 맥락 판단. 브랜드 규제 근거로 문맥까지 본다(금지어 매칭이 놓치는 것).
// 실패(파싱/호출)하면 빈 결과를 돌려주고, 호출부에서 규칙 기반 결과만 쓴다.
export async function runComplianceLLM(
  brand: Brand,
  body: string
): Promise<{ verdict: "pass" | "fail"; findings: ComplianceFinding[] }> {
  try {
    const anthropic = getAnthropic();
    const system = `너는 한국 표시광고 규제 검수관이다. 주어진 브랜드의 규제 근거에 비추어 마케팅 문구를 검수한다.
브랜드 카테고리별 기준:
- 화장품(화장품법): 질병 치료·의약품·의료기기 효능 오인 표현 금지.
- 건강기능식품(건강기능식품법): 인정 기능성 범위 밖 효능, 질병 예방·치료 표현 금지.
- 일반식품(식품표시광고법): 기능성·효능 표현 금지.
- F&B(식품표시광고법·원산지표시법): 효능·과장, 원산지 오인 금지.
- 의료(의료법): 의료광고 사전심의 대상 — 자동 생성물은 무조건 부적합 처리.
공통: 보장·전액책임·무조건 등 무한책임, 근거 없는 최상급·절대 표현 금지.
반드시 아래 JSON만 출력한다:
{"verdict":"pass"|"fail","findings":[{"phrase":"지적 문구","reason":"위반 이유","suggestion":"대체 제안","rule":"근거"}]}
위반이 없으면 findings 는 빈 배열, verdict 는 "pass".`;

    const user = `[브랜드] ${brand.name}
[카테고리] ${brand.category ?? "-"}
[규제 근거] ${brand.regulation ?? "-"}

[검수 대상 문구]
${body.slice(0, 4000)}`;

    const { msg } = await createMessageWithFallback(anthropic, {
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = msg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { verdict: "pass", findings: [] };
    const parsed = JSON.parse(m[0]) as {
      verdict?: string;
      findings?: ComplianceFinding[];
    };
    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
    const verdict = parsed.verdict === "fail" || findings.length > 0 ? "fail" : "pass";
    return { verdict, findings };
  } catch {
    return { verdict: "pass", findings: [] };
  }
}
