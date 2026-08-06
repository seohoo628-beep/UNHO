// fal.ai 이미지 생성/편집. 키 하나(FAL_KEY)로 동작한다.
// 대외 발송은 하지 않는다 — 생성 결과는 내부 초안 첨부로만 저장한다.
import { getSetting } from "@/lib/settings";

const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/schnell";

// 실제 제품컷을 입력으로 쓰는 '이미지 편집' 최상위 모델. 기본 Nano Banana(Gemini 2.5 Flash Image).
const DEFAULT_EDIT_MODEL = "fal-ai/nano-banana/edit";

export function falKey(): string | null {
  return process.env.FAL_KEY || null;
}

async function editModel(): Promise<string> {
  return (await getSetting("thumb_model")) || process.env.THUMB_MODEL || DEFAULT_EDIT_MODEL;
}

export type FalImage = { url: string; width?: number; height?: number };

// 제품컷을 기반으로 마케팅 썸네일을 '편집 생성'한다. 모델마다 입력 필드가 달라 다단 시도.
// imageUrl 은 한 장(string) 또는 여러 장(string[]) — 여러 장이면 모두 참고해 합성한다.
export async function editImage(imageUrl: string | string[], prompt: string): Promise<FalImage> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY 가 설정되지 않았습니다.");
  const model = await editModel();

  // 참고 이미지가 너무 많으면 모델이 거부/지연될 수 있어 6장으로 제한.
  const urls = (Array.isArray(imageUrl) ? imageUrl : [imageUrl]).filter(Boolean).slice(0, 6);
  if (urls.length === 0) throw new Error("참고할 이미지가 없습니다.");

  // Nano Banana(edit)는 image_urls 배열(여러 장 참고), FLUX Kontext 등은 image_url 단일을 받는다.
  const bodies: Record<string, unknown>[] = [
    { prompt, image_urls: urls, num_images: 1 },
    { prompt, image_url: urls[0], num_images: 1 },
  ];
  let lastErr = "알 수 없는 오류";
  for (const body of bodies) {
    // 동시 생성 시 rate limit(429)·일시 서버오류(5xx)는 백오프 후 재시도.
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await fetch(`https://fal.run/${model}`, {
          method: "POST",
          headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (e) {
        lastErr = e instanceof Error ? e.message : "요청 실패";
        await sleep(700 * (attempt + 1));
        continue; // 네트워크 오류 → 재시도
      }
      if (res.ok) {
        const j = (await res.json()) as { images?: FalImage[]; image?: FalImage; url?: string };
        const url = j.images?.[0]?.url || j.image?.url || j.url;
        if (url) return { url };
        lastErr = "빈 응답";
        break; // 다음 body 형태로
      }
      const t = await res.text();
      console.error("[edit-image] 실패", model, res.status, t.slice(0, 200));
      lastErr = `${res.status} ${t.slice(0, 140)}`;
      if (res.status === 429 || res.status >= 500) {
        await sleep(900 * Math.pow(2, attempt)); // 429/5xx → 백오프 재시도
        continue;
      }
      break; // 4xx(422 등)는 이 body로 안 되니 다음 body 시도
    }
  }
  throw new Error(`이미지 편집 실패: ${lastErr}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function generateImage(
  prompt: string,
  imageSize:
    | "square_hd"
    | "landscape_16_9"
    | "portrait_16_9" = "square_hd"
): Promise<FalImage> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY 가 설정되지 않았습니다.");

  const res = await fetch(FAL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: imageSize,
      num_images: 1,
      enable_safety_checker: true,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`이미지 생성 실패: ${res.status} ${t.slice(0, 160)}`);
  }
  const json = (await res.json()) as { images?: FalImage[] };
  const img = json.images?.[0];
  if (!img?.url) throw new Error("이미지 응답이 비어 있습니다.");
  return img;
}
