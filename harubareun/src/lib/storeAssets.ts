"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { assertStoreAccess } from "@/lib/storeAuth";

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

export async function uploadAsset(formData: FormData): Promise<Result & { count?: number }> {
  const platform = String(formData.get("platform")) === "dining" ? "dining" : "fnb";
  try { await assertStoreAccess(platform); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
  const store = String(formData.get("store") ?? "all") || "all";
  const section = String(formData.get("section") ?? "design") || "design";
  const title = String(formData.get("title") ?? "").trim() || null;

  // 여러 파일 일괄 업로드 지원(input multiple). 단일 선택도 그대로 동작.
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "파일을 선택하세요." };
  const tooBig = files.find((f) => f.size > 50 * 1024 * 1024);
  if (tooBig) return { ok: false, error: `‘${tooBig.name}’ 등 50MB 초과 파일이 있습니다. 파일당 50MB 이하만 올릴 수 있습니다.` };

  try {
    const svc = createSupabaseServiceClient();
    const single = files.length === 1;
    const rows: any[] = [];
    const uploaded: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const safe = file.name.replace(/[^\w.\-가-힣]/g, "_");
      const path = `asset-files/${platform}_${store}_${Date.now()}_${i}_${safe}`;
      const buf = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buf, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        // 이미 올라간 파일 정리 후 실패 반환.
        if (uploaded.length) await svc.storage.from(BUCKET).remove(uploaded);
        return { ok: false, error: `업로드 실패(${file.name}): ${upErr.message} (공개 버킷 '${BUCKET}' 필요)` };
      }
      uploaded.push(path);
      rows.push({
        platform, store, section,
        // 제목은 1개일 때만 적용. 여러 개면 각 파일명 사용.
        title: single ? (title ?? file.name) : file.name,
        file_name: file.name,
        file_path: path,
        kind: kindOf(file.type || "", file.name),
      });
    }

    const { error } = await svc.from("store_assets").insert(rows);
    if (error) {
      if (uploaded.length) await svc.storage.from(BUCKET).remove(uploaded);
      return { ok: false, error: error.message };
    }
    revalidatePath(`/${platform}/assets`);
    return { ok: true, count: rows.length };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "오류" };
  }
}

export async function deleteAsset(id: string, platform: "fnb" | "dining", filePath?: string): Promise<Result> {
  try { await assertStoreAccess(platform); } catch (e: any) { return { ok: false, error: e?.message ?? "권한 오류" }; }
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
