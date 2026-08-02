"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// /fnb, /dining 자료실 파일 직접 업로드. service_role로 처리(공개 버킷 generated-media).

type Result = { ok: boolean; error?: string };
const BUCKET = "generated-media";

function kindOf(type: string, name: string): "image" | "video" | "doc" {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return "image";
  if (/\.(mp4|mov|webm|m4v)$/i.test(name)) return "video";
  return "doc";
}

export async function uploadAsset(formData: FormData): Promise<Result> {
  const platform = String(formData.get("platform")) === "dining" ? "dining" : "fnb";
  const store = String(formData.get("store") ?? "all") || "all";
  const section = String(formData.get("section") ?? "design") || "design";
  const title = String(formData.get("title") ?? "").trim() || null;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "파일을 선택하세요." };
  if (file.size > 50 * 1024 * 1024) return { ok: false, error: "파일은 50MB 이하만 업로드할 수 있습니다." };

  try {
    const svc = createSupabaseServiceClient();
    const safe = file.name.replace(/[^\w.\-가-힣]/g, "_");
    const path = `asset-files/${platform}_${store}_${Date.now()}_${safe}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buf, { contentType: file.type || undefined, upsert: false });
    if (upErr) return { ok: false, error: `업로드 실패: ${upErr.message} (공개 버킷 '${BUCKET}' 필요)` };

    const { error } = await svc.from("store_assets").insert({
      platform, store, section,
      title: title ?? file.name,
      file_name: file.name,
      file_path: path,
      kind: kindOf(file.type || "", file.name),
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/${platform}/assets`);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "오류" };
  }
}

export async function deleteAsset(id: string, platform: "fnb" | "dining", filePath?: string): Promise<Result> {
  try {
    const svc = createSupabaseServiceClient();
    if (filePath) await svc.storage.from(BUCKET).remove([filePath]);
    const { error } = await svc.from("store_assets").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/${platform}/assets`);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "오류" };
  }
}
