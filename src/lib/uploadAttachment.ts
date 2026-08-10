import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// 클라이언트에서 파일을 Supabase Storage(공개 버킷)로 직접 올리고 공개 URL을 돌려준다.
// (서버 액션 본문 4.5MB 한도 회피 · 대용량 지원)
export async function uploadAttachment(
  file: File,
  prefix = "todo-files"
): Promise<{ ok: boolean; url?: string; name?: string; error?: string }> {
  if (file.size > 3 * 1024 * 1024 * 1024) return { ok: false, error: "파일이 너무 큽니다(3GB 초과)." };
  try {
    const supabase = createSupabaseBrowserClient();
    // Storage 키는 ASCII만 허용 → 한글 파일명은 경로에서 제거(원본명은 별도 저장).
    const dot = file.name.lastIndexOf(".");
    const ext = (dot >= 0 ? file.name.slice(dot + 1) : "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8);
    const base = (dot >= 0 ? file.name.slice(0, dot) : file.name).replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40) || "file";
    const rand = Math.random().toString(36).slice(2, 7);
    const path = `${prefix}/${Date.now()}_${rand}_${base}${ext ? "." + ext : ""}`;
    const { error } = await supabase.storage
      .from("generated-media")
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) return { ok: false, error: error.message };
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/${path}`;
    return { ok: true, url, name: file.name };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
