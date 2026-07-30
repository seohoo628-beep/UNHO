import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { generateImage, falKey } from "@/lib/media/fal";
import { buildImagePrompt } from "@/lib/media/imagePrompt";
import { getAnthropic, createMessageWithFallback } from "@/lib/anthropic";
import type { Brand } from "@/lib/types";

// 승인된 대본 내용을 반영해 이미지 프롬프트를 정교화한다(관련성 개선).
// 실패하면 규칙 기반 기본 프롬프트로 폴백한다. (그래도 실제 제품 재현은 불가)
async function craftPrompt(brand: Brand, title: string | null, body: string | null): Promise<string> {
  const fallback = buildImagePrompt(brand, title);
  try {
    const anthropic = getAnthropic();
    const { msg } = await createMessageWithFallback(anthropic, {
      max_tokens: 200,
      system:
        "You write a single concise English text-to-image prompt (max 50 words) for a Korean e-commerce marketing thumbnail. Photorealistic product/lifestyle photography, clean studio or lifestyle scene, no text, no letters, no logos, no watermark. Reflect the brand category and the described concept. Output ONLY the prompt.",
      messages: [
        {
          role: "user",
          content: `Brand: ${brand.name}\nCategory: ${brand.category ?? ""}\nProduct: ${brand.flagship ?? ""}\nColors: ${[brand.vi_primary, brand.vi_accent].filter(Boolean).join(", ")}\nConcept/script excerpt: ${(body ?? "").slice(0, 500)}`,
        },
      ],
    });
    const text = msg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

export const MEDIA_BUCKET = "generated-media";

// 산출물 하나에 대해 썸네일을 생성해 Storage에 저장하고 attachments에 기록한다.
// 서버(service_role)에서 실행한다. 실패해도 예외를 던지지 않고 error 로 돌려준다.
export async function generateThumbnailForOutput(
  aiOutputId: string,
  uploaderId: string | null,
  aspect: "square_hd" | "landscape_16_9" | "portrait_16_9" = "square_hd"
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!falKey()) return { ok: false, error: "FAL_KEY 가 설정되지 않았습니다." };

  const svc = createSupabaseServiceClient();
  const { data: output } = await svc
    .from("ai_outputs")
    .select("id, title, body, brand_id, brands(*)")
    .eq("id", aiOutputId)
    .maybeSingle();
  if (!output) return { ok: false, error: "산출물을 찾을 수 없습니다." };

  const brand = (output as unknown as { brands: Brand }).brands;
  const title = (output as unknown as { title: string | null }).title;
  const body = (output as unknown as { body: string | null }).body;

  try {
    const prompt = await craftPrompt(brand, title, body);
    const img = await generateImage(prompt, aspect);

    const imgRes = await fetch(img.url);
    if (!imgRes.ok) return { ok: false, error: "생성 이미지 다운로드 실패" };
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const path = `${brand.id}/${aiOutputId}/${Date.now()}.jpg`;

    const { error: upErr } = await svc.storage
      .from(MEDIA_BUCKET)
      .upload(path, buf, { contentType: "image/jpeg", upsert: false });
    if (upErr) {
      return {
        ok: false,
        error: `저장 실패: ${upErr.message} (공개 버킷 '${MEDIA_BUCKET}' 필요)`,
      };
    }

    const { data: pub } = svc.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    await svc.from("attachments").insert({
      ai_output_id: aiOutputId,
      storage_path: path,
      file_name: "thumbnail.jpg",
      uploaded_by: uploaderId,
    });
    return { ok: true, url: pub.publicUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "이미지 생성 실패" };
  }
}
