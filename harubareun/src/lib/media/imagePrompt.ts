import type { Brand } from "@/lib/types";

// 승인된 산출물과 브랜드 VI로부터 썸네일 이미지 프롬프트를 만든다.
// 이미지 모델은 영어 프롬프트를 선호하므로 영어로 조립한다. 문자 삽입은 피한다.
export function buildImagePrompt(brand: Brand, title: string | null): string {
  const palette = [brand.vi_primary, brand.vi_accent, brand.vi_secondary]
    .filter(Boolean)
    .join(", ");
  const category = brand.category ?? "";
  const flagship = brand.flagship ?? "";

  const kind = /화장품/.test(category)
    ? "premium cosmetic product photography"
    : /건강기능식품|식품/.test(category)
    ? "clean health food product photography"
    : /F&B/.test(category)
    ? "appetizing korean food photography"
    : "clean commercial product photography";

  return [
    `${kind} thumbnail for a korean brand`,
    flagship ? `featuring ${flagship}` : "",
    `brand color palette ${palette || "neutral tones"}`,
    "studio lighting, minimal composition, high detail, marketing key visual",
    "no text, no letters, no watermark",
    title ? `concept: ${title}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}
