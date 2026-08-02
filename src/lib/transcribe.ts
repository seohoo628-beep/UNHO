// 음성 → 텍스트 변환 (OpenAI Whisper). 키는 환경변수 OPENAI_API_KEY 우선,
// 없으면 설정 화면에서 저장한 app_settings.openai_api_key 사용.

export async function getOpenAIKey(): Promise<string | null> {
  const env = process.env.OPENAI_API_KEY;
  if (env && env.trim()) return env.trim();
  try {
    const { getSetting } = await import("@/lib/settings");
    const k = await getSetting("openai_api_key");
    return k && k.trim() ? k.trim() : null;
  } catch {
    return null;
  }
}

export function isAudioPath(p: string): boolean {
  return /\.(m4a|mp3|wav|webm|ogg|oga|aac|mp4|mpeg|mpga|flac)$/i.test(p || "");
}

export async function transcribeAudio(
  buf: Buffer,
  fileName: string,
  mime: string
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const key = await getOpenAIKey();
  if (!key) return { ok: false, error: "음성 텍스트 변환 키(OpenAI)가 설정되지 않았습니다." };
  if (buf.length > 25 * 1024 * 1024) return { ok: false, error: "음성 파일이 너무 큽니다(25MB 초과). 잘라서 올려주세요." };
  try {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(buf)], { type: mime || "audio/m4a" });
    form.append("file", blob, fileName || "audio.m4a");
    form.append("model", "whisper-1");
    form.append("language", "ko");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `변환 실패(${res.status}): ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { text?: string };
    return { ok: true, text: (data.text || "").trim() };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
