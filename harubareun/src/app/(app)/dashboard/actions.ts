"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Result = { ok: boolean; error?: string };

const BUCKET = "generated-media";
const CATEGORIES = ["브랜딩", "광고", "SNS", "상세페이지", "기타"];

export async function uploadContent(formData: FormData): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") {
    return { ok: false, error: "권한이 없습니다." };
  }
  const brandId = String(formData.get("brand_id") ?? "");
  const category = String(formData.get("category") ?? "브랜딩");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "파일을 선택하세요." };
  }

  const svc = createSupabaseServiceClient();
  const safe = file.name.replace(/[^\w.\-가-힣]/g, "_");
  const path = `content-gallery/${brandId || "공통"}/${Date.now()}_${safe}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await svc.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type || undefined, upsert: false });
  if (upErr) {
    return { ok: false, error: `업로드 실패: ${upErr.message} (공개 버킷 '${BUCKET}' 필요)` };
  }

  const { error } = await svc.from("content_gallery").insert({
    brand_id: brandId || null,
    category: CATEGORIES.includes(category) ? category : "기타",
    title: String(formData.get("title") ?? "").trim() || null,
    storage_path: path,
    file_name: file.name,
    mime: file.type || null,
    uploaded_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteContent(id: string, storagePath: string): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") {
    return { ok: false, error: "권한이 없습니다." };
  }
  const svc = createSupabaseServiceClient();
  await svc.storage.from(BUCKET).remove([storagePath]);
  const { error } = await svc.from("content_gallery").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}
