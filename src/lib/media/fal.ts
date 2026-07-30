// fal.ai 이미지 생성. 키 하나(FAL_KEY)로 동작한다. flux/schnell = 빠르고 저렴.
// 대외 발송은 하지 않는다 — 생성 결과는 내부 초안 첨부로만 저장한다.

const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/schnell";

export function falKey(): string | null {
  return process.env.FAL_KEY || null;
}

export type FalImage = { url: string; width?: number; height?: number };

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
