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

// 영상 길이(초)·해상도. 설정(seedance_duration / seedance_resolution)으로 조정.
// seedance 단일 클립 지원 범위 내에서 기본값을 최대·고화질로 둔다.
async function seedanceDuration(): Promise<string> {
  return String((await getSetting("seedance_duration")) || process.env.SEEDANCE_DURATION || "10");
}
async function seedanceResolution(): Promise<string> {
  return (await getSetting("seedance_resolution")) || process.env.SEEDANCE_RESOLUTION || "1080p";
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
  const [model, duration, resolution] = await Promise.all([seedanceModel(), seedanceDuration(), seedanceResolution()]);

  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt:
        prompt ||
        "A premium cinematic product commercial. Smooth camera motion, natural soft lighting, shallow depth of field, elegant reveal, photorealistic, high detail. Do not add any on-screen text, captions, subtitles, letters or words. Keep any existing product label text sharp, legible and undistorted — never warp, melt or animate text.",
      image_url: imageUrl,
      duration,
      resolution,
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
  const payload = (await rRes.json()) as any;
  const url = payload?.video?.url || payload?.url || payload?.video_url || payload?.output?.url || payload?.output?.video?.url;
  if (!url) return { state: "failed", error: "영상 URL이 비어 있습니다." };
  return { state: "done", videoUrl: url };
}

// 여러 영상을 하나로 이어붙이기(fal ffmpeg 유틸). 엔드포인트·해상도는 설정으로 교체 가능.
const DEFAULT_MERGE_MODEL = "fal-ai/ffmpeg-api/merge-videos";
async function mergeModel(): Promise<string> {
  return (await getSetting("video_merge_model")) || process.env.VIDEO_MERGE_MODEL || DEFAULT_MERGE_MODEL;
}
// 병합 결과 해상도(릴스·숏츠는 세로). fal merge-videos enum: landscape_16_9 / portrait_16_9 / square 등.
async function mergeResolution(): Promise<string> {
  return (await getSetting("video_merge_resolution")) || process.env.VIDEO_MERGE_RESOLUTION || "portrait_16_9";
}

export async function submitMergeVideos(videoUrls: string[]): Promise<SubmitResult> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY 미설정");
  const [model, resolution] = await Promise.all([mergeModel(), mergeResolution()]);

  // 계정/모델마다 허용하는 입력 필드가 달라, 넉넉한 것부터 최소한까지 순차 시도한다.
  // (예: resolution enum이 안 맞아 422가 나면 resolution 없이 재시도)
  const bodies: Record<string, unknown>[] = [
    { video_urls: videoUrls, resolution, target_fps: 30 },
    { video_urls: videoUrls, target_fps: 30 },
    { video_urls: videoUrls, resolution },
    { video_urls: videoUrls },
  ];

  const errors: string[] = [];
  for (const body of bodies) {
    let res: Response;
    try {
      res = await fetch(`https://queue.fal.run/${model}`, {
        method: "POST",
        headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      errors.push(`네트워크 오류: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (res.ok) {
      const j = (await res.json()) as { request_id?: string; status_url?: string; response_url?: string };
      if (j.request_id && j.status_url && j.response_url) {
        return { requestId: j.request_id, statusUrl: j.status_url, responseUrl: j.response_url };
      }
      errors.push("큐 응답 형식 오류");
      continue;
    }
    const t = await res.text();
    console.error("[merge-videos] 실패", res.status, JSON.stringify(body), t.slice(0, 300));
    errors.push(`${res.status} ${t.slice(0, 120)}`);
    // 4xx(입력 문제)면 다음 변형 시도, 5xx면 즉시 중단
    if (res.status >= 500) break;
  }
  throw new Error(`영상 병합 요청 실패: ${errors[0] ?? "알 수 없는 오류"}`);
}
