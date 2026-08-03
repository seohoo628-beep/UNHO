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

// fal의 Whisper로 변환(audio_url 기반). ffmpeg 내장이라 삼성 통화녹음 등 포맷에 관대하고
// 멀티파트 파일명 문제도 없다. FAL_KEY 필요.
export async function transcribeViaFal(
  audioUrl: string
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const key = process.env.FAL_KEY;
  if (!key) return { ok: false, error: "FAL_KEY 미설정" };
  try {
    const res = await fetch("https://fal.run/fal-ai/whisper", {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: audioUrl, task: "transcribe", language: "ko" }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `fal 변환 실패(${res.status}): ${t.slice(0, 180)}` };
    }
    const j = (await res.json()) as {
      text?: string;
      transcription?: string;
      chunks?: { text?: string }[];
    };
    const text =
      j.text || j.transcription || (j.chunks ?? []).map((c) => c.text ?? "").join(" ");
    return { ok: true, text: (text || "").trim() };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
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
    // OpenAI는 '파일명 확장자'로 포맷을 판별한다. Node fetch에서 Blob을 쓰면
    // filename이 "blob"으로 전송돼 확장자가 사라지고 400(Invalid file format)이 난다.
    // → 반드시 확장자가 살아있는 File로 보낸다.
    const OK_EXTS = ["flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm"];
    const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
    const safeExt = OK_EXTS.includes(ext) ? ext : "m4a";
    const safeName =
      ext && OK_EXTS.includes(ext) && /[^/\\]+\.[a-z0-9]+$/i.test(fileName) ? fileName : `audio.${safeExt}`;
    const safeType =
      mime && mime !== "application/octet-stream" && mime.startsWith("audio")
        ? mime
        : `audio/${safeExt === "mp3" ? "mpeg" : safeExt === "m4a" ? "mp4" : safeExt}`;

    const form = new FormData();
    const file = new File([new Uint8Array(buf)], safeName, { type: safeType });
    form.append("file", file);
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
