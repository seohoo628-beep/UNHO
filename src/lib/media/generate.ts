import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { generateImage, falKey } from "@/lib/media/fal";
import { buildImagePrompt } from "@/lib/media/imagePrompt";
import type { Brand } from "@/lib/types";

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
    .select("id, title, brand_id, brands(*)")
    .eq("id", aiOutputId)
    .maybeSingle();
  if (!output) return { ok: false, error: "산출물을 찾을 수 없습니다." };

  const brand = (output as unknown as { brands: Brand }).brands;
  const title = (output as unknown as { title: string | null }).title;

  try {
    const prompt = buildImagePrompt(brand, title);
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
