import { editImage } from "@/lib/media/fal";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type ThumbAspect = "portrait_16_9" | "square_hd" | "landscape_16_9";

const ASPECT_WORD: Record<ThumbAspect, string> = {
  portrait_16_9: "vertical 9:16 portrait",
  square_hd: "square 1:1",
  landscape_16_9: "horizontal 16:9 landscape",
};

// 제품컷을 '참고'하되 광고처럼 확실히 발전시키는 프롬프트(단순 복사 방지).
export function buildThumbPrompt(aspect: ThumbAspect, palette: string, concept: string, multi: boolean): string {
  return [
    multi
      ? "Use ALL provided product photos together as reference for the SAME real product/food (multiple angles/items), and reimagine them into a single premium, scroll-stopping advertising key visual / thumbnail for a Korean brand."
      : "Reimagine this photo into a premium, scroll-stopping advertising key visual / thumbnail for a Korean brand.",
    "Keep the product or food truthful and recognizable (same kind of food/product, realistic and appetizing), but DEVELOP it well beyond the original snapshot:",
    "art-direct a polished scene with professional or moody ambient lighting, tasteful styling, complementary props and fresh garnish, a designed background with depth and bokeh, cinematic color grading, and high-end editorial magazine quality.",
    "It should look clearly more refined, styled and designed than a plain phone photo, while still showing the same real dish/product.",
    `${ASPECT_WORD[aspect]} composition, strong focal point, generous negative space suitable for a thumbnail.`,
    palette ? `Subtle brand color accents: ${palette}.` : "",
    concept ? `Creative direction: ${concept}.` : "",
    "Photorealistic, sharp, high resolution. Absolutely no text, no letters, no captions, no watermark, no logo.",
  ]
    .filter(Boolean)
    .join(" ");
}

// 브랜드 제품컷으로 썸네일 1장 생성 → Storage 업로드 → 공개 URL 반환. (업무 task와 무관)
export async function renderBrandThumb(opts: {
  brandId: string | null;
  aspect: ThumbAspect;
  concept?: string;
  keyPrefix: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const svc = createSupabaseServiceClient();
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/`;

  let imgs: string[] = [];
  let palette = "";
  if (opts.brandId) {
    const { data: shots } = await svc
      .from("product_shots")
      .select("storage_path")
      .eq("brand_id", opts.brandId)
      .order("created_at", { ascending: false })
      .limit(6);
    imgs = ((shots ?? []) as { storage_path: string }[]).map((s) => base + s.storage_path);
    const { data: b } = await svc
      .from("brands")
      .select("vi_primary, vi_accent, vi_secondary")
      .eq("id", opts.brandId)
      .maybeSingle();
    if (b) {
      const bb = b as { vi_primary: string | null; vi_accent: string | null; vi_secondary: string | null };
      palette = [bb.vi_primary, bb.vi_accent, bb.vi_secondary].filter(Boolean).join(", ");
    }
  }
  if (imgs.length === 0) {
    return { ok: false, error: "이 브랜드의 제품컷이 없습니다. ‘제품 이미지·영상 자료’에 먼저 올려주세요." };
  }

  const prompt = buildThumbPrompt(opts.aspect, palette, (opts.concept || "").trim(), imgs.length > 1);
  try {
    const img = await editImage(imgs, prompt);
    const bin = await fetch(img.url, { cache: "no-store" });
    if (!bin.ok) throw new Error("생성 이미지 다운로드 실패");
    const buf = Buffer.from(await bin.arrayBuffer());
    const path = `thumbs/${opts.keyPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await svc.storage.from("generated-media").upload(path, buf, { contentType: "image/jpeg", upsert: true });
    if (error) return { ok: false, error: `저장 실패: ${error.message}` };
    return { ok: true, url: base + path };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "이미지 생성 실패" };
  }
}
