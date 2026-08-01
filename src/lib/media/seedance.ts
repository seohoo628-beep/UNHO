// Seedance(바이트댄스) 영상 생성 — fal.ai 큐 API. 제품컷 이미지 → 영상.
// 비동기: submit → 폴링(status) → 결과(response). 대외 발송 없음, 내부 첨부용.
import { getSetting } from "@/lib/settings";

const DEFAULT_MODEL = "fal-ai/bytedance/seedance/v1/pro/image-to-video";

function falKey(): string | null {
  return process.env.FAL_KEY || null;
}

// 모델 ID는 설정(seedance_model) 또는 env(SEEDANCE_FAL_MODEL)로 바꿀 수 있다.
export async function seedanceModel(): Promise<string> {
  return (await getSetting("seedance_model")) || process.env.SEEDANCE_FAL_MODEL || DEFAULT_MODEL;
}

export type SubmitResult = {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
};

export async function submitSeedanceVideo(
  imageUrl: string,
  prompt: string
): Promise<SubmitResult> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY 가 설정되지 않았습니다. Vercel 환경변수에 등록하세요.");
  const model = await seedanceModel();

  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: prompt || "제품을 자연스럽게 보여주는 짧은 광고 영상",
      image_url: imageUrl,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`영상 요청 실패: ${res.status} ${t.slice(0, 180)}`);
  }
  const j = (await res.json()) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };
  if (!j.request_id || !j.status_url || !j.response_url) {
    throw new Error("fal 큐 응답이 올바르지 않습니다.");
  }
  return { requestId: j.request_id, statusUrl: j.status_url, responseUrl: j.response_url };
}

export type PollResult =
  | { state: "processing" }
  | { state: "done"; videoUrl: string }
  | { state: "failed"; error: string };

export async function pollSeedanceVideo(statusUrl: string, responseUrl: string): Promise<PollResult> {
  const key = falKey();
  if (!key) return { state: "failed", error: "FAL_KEY 미설정" };

  const sRes = await fetch(statusUrl, {
    headers: { Authorization: `Key ${key}` },
    cache: "no-store",
  });
  if (!sRes.ok) return { state: "failed", error: `상태 조회 실패(${sRes.status})` };
  const status = (await sRes.json()) as { status?: string };

  if (status.status !== "COMPLETED") return { state: "processing" };

  const rRes = await fetch(responseUrl, {
    headers: { Authorization: `Key ${key}` },
    cache: "no-store",
  });
  if (!rRes.ok) return { state: "failed", error: `결과 조회 실패(${rRes.status})` };
  const payload = (await rRes.json()) as { video?: { url?: string }; url?: string };
  const url = payload.video?.url || payload.url;
  if (!url) return { state: "failed", error: "영상 URL이 비어 있습니다." };
  return { state: "done", videoUrl: url };
}
