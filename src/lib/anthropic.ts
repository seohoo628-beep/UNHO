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

// 키는 환경변수(ANTHROPIC_API_KEY)를 우선하고, 없으면 설정 화면에서 저장한
// app_settings.anthropic_api_key 를 사용한다. (설정값은 service_role 로만 읽어 서버에서만 쓴다)
export async function getAnthropicKey(): Promise<string | null> {
  const env = process.env.ANTHROPIC_API_KEY;
  if (env && env.trim()) return env.trim();
  try {
    const { getSetting } = await import("@/lib/settings");
    const k = await getSetting("anthropic_api_key");
    return k && k.trim() ? k.trim() : null;
  } catch {
    return null;
  }
}

export async function getAnthropic(): Promise<Anthropic> {
  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    throw new Error("ANTHROPIC API 키가 설정되지 않았습니다. 설정 화면에서 키를 입력하거나 환경변수를 등록하세요.");
  }
  return new Anthropic({ apiKey });
}

/**
 * 후보 모델을 순서대로 시도한다. 모델이 없어서(404 not_found) 실패하면 다음 후보로
 * 넘어가고, 인증·크레딧 등 다른 오류는 즉시 던진다. 성공한 모델명을 함께 반환한다.
 */
// API 오류를 사용자용 한국어 안내로 변환(크레딧 소진·키 오류·과부하 등).
export function friendlyAiError(e: unknown): string {
  const msg = (e as { message?: string })?.message || String(e);
  if (/credit balance is too low/i.test(msg))
    return "Anthropic AI 크레딧이 소진되었습니다. console.anthropic.com → Plans & Billing에서 충전하면 명함 인식·어시스턴트·회의록 정리 등 모든 AI 기능이 다시 동작합니다.";
  if (/invalid x-api-key|authentication_error/i.test(msg))
    return "AI API 키가 유효하지 않습니다. 설정 → AI 키를 확인해 주세요.";
  if (/rate.?limit|429|overloaded/i.test(msg))
    return "AI 사용량이 일시적으로 몰렸습니다. 잠시 후 다시 시도해 주세요.";
  return msg;
}

export async function createMessageWithFallback(
  anthropic: Anthropic,
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model">,
  models?: string[]
): Promise<{ msg: Anthropic.Message; model: string }> {
  let lastErr: unknown;
  const candidates = (models && models.length ? models : MODEL_CANDIDATES);
  for (const model of candidates) {
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
