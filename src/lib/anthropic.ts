import Anthropic from "@anthropic-ai/sdk";

// 계정마다 접근 가능한 모델이 달라, 후보를 순서대로 시도해 되는 것을 쓴다.
// ANTHROPIC_MODEL 을 지정하면 그것을 맨 앞에 둔다.
export const MODEL_CANDIDATES: string[] = [
  process.env.ANTHROPIC_MODEL,
  // 현행 "5" 모델군 (계정에서 사용 가능한 최신 모델)
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
  "claude-opus-5",
  // 구세대 계정 대비 레거시 폴백
  "claude-3-5-sonnet-latest",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
]
  .filter((m): m is string => !!m)
  .map((m) => m.trim())
  .filter((m) => m.length > 0);

export const DEFAULT_MODEL = MODEL_CANDIDATES[0];

export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 가 설정되지 않았습니다.");
  }
  return new Anthropic({ apiKey });
}

/**
 * 후보 모델을 순서대로 시도한다. 모델이 없어서(404 not_found) 실패하면 다음 후보로
 * 넘어가고, 인증·크레딧 등 다른 오류는 즉시 던진다. 성공한 모델명을 함께 반환한다.
 */
export async function createMessageWithFallback(
  anthropic: Anthropic,
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model">
): Promise<{ msg: Anthropic.Message; model: string }> {
  let lastErr: unknown;
  for (const model of MODEL_CANDIDATES) {
    try {
      const msg = await anthropic.messages.create({ ...params, model });
      return { msg, model };
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const type = (e as { error?: { error?: { type?: string } } })?.error?.error
        ?.type;
      if (status === 404 || type === "not_found_error") {
        lastErr = e;
        continue; // 이 모델은 계정에서 못 씀 → 다음 후보
      }
      throw e; // 인증/크레딧 등은 바로 노출
    }
  }
  throw (
    lastErr ??
    new Error("사용 가능한 Anthropic 모델을 찾지 못했습니다. 계정 모델 접근 권한을 확인하세요.")
  );
}
