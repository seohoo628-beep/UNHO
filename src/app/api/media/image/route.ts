import { NextResponse } from "next/server";
import { getAppUserOrNull } from "@/lib/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { generateImage } from "@/lib/media/fal";
import { buildImagePrompt } from "@/lib/media/imagePrompt";
import type { Brand } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "generated-media";

// 승인된 산출물의 썸네일 이미지를 생성해 Storage에 저장하고 첨부로 기록한다.
export async function POST(req: Request) {
  const user = await getAppUserOrNull();
  if (!user || (user.role !== "owner" && user.role !== "staff")) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  let body: { aiOutputId?: string; aspect?: "square_hd" | "landscape_16_9" | "portrait_16_9" } = {};
  try {
    body = await req.json();
  } catch {
    /* noop */
  }
  if (!body.aiOutputId) {
    return NextResponse.json({ error: "aiOutputId 가 필요합니다." }, { status: 400 });
  }

  const svc = createSupabaseServiceClient();
  const { data: output } = await svc
    .from("ai_outputs")
    .select("id, title, brand_id, brands(*)")
    .eq("id", body.aiOutputId)
    .maybeSingle();
  if (!output) {
    return NextResponse.json({ error: "산출물을 찾을 수 없습니다." }, { status: 404 });
  }
  const brand = (output as unknown as { brands: Brand }).brands;
  const title = (output as unknown as { title: string | null }).title;

  try {
    const prompt = buildImagePrompt(brand, title);
    const img = await generateImage(prompt, body.aspect ?? "square_hd");

    // 생성 이미지를 내려받아 Storage에 저장
    const imgRes = await fetch(img.url);
    if (!imgRes.ok) throw new Error("생성 이미지 다운로드 실패");
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const path = `${brand.id}/${body.aiOutputId}/${Date.now()}.jpg`;

    const { error: upErr } = await svc.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "image/jpeg", upsert: false });
    if (upErr) {
      return NextResponse.json(
        {
          error:
            "저장 실패: " +
            upErr.message +
            ` (Supabase Storage에 공개 버킷 '${BUCKET}' 이 필요합니다)`,
        },
        { status: 400 }
      );
    }

    const { data: pub } = svc.storage.from(BUCKET).getPublicUrl(path);

    await svc.from("attachments").insert({
      ai_output_id: body.aiOutputId,
      storage_path: path,
      file_name: "thumbnail.jpg",
      uploaded_by: user.id,
    });

    return NextResponse.json({ ok: true, url: pub.publicUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "이미지 생성 실패" },
      { status: 500 }
    );
  }
}
