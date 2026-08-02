"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

export interface AssetInput {
  title: string;
  kind: string;
  brand: string;
  link: string;
  thumbUrl: string;
  note: string;
}

const PUBLIC_MARKER = "/storage/v1/object/public/generated-media/";

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

function row(inp: AssetInput) {
  return {
    title: inp.title.trim(),
    kind: inp.kind || "이미지",
    brand: inp.brand?.trim() || null,
    link: inp.link?.trim() || null,
    thumb_url: inp.thumbUrl?.trim() || null,
    note: inp.note?.trim() || null,
  };
}

// 업로드된 여러 파일을 한 번에 등록 (파일 자체는 클라이언트가 Storage에 올리고 경로만 넘김)
export async function createAssetsBulk(items: AssetInput[]): Promise<Result & { count?: number }> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const valid = (items || []).filter((i) => i.title?.trim());
  if (!valid.length) return { ok: false, error: "등록할 자료가 없습니다." };
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("product_assets").insert(valid.map(row));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true, count: valid.length };
}

export async function createAsset(inp: AssetInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  if (!inp.title?.trim()) return { ok: false, error: "제목을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("product_assets").insert(row(inp));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true };
}

export async function updateAsset(id: string, inp: AssetInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("product_assets")
    .update({ ...row(inp), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true };
}

export async function deleteAsset(id: string, link?: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  // 업로드 파일이면(공개 URL) 스토리지에서도 정리
  if (link && link.includes(PUBLIC_MARKER)) {
    const path = decodeURIComponent(link.split(PUBLIC_MARKER)[1] || "");
    if (path) {
      try {
        await createSupabaseServiceClient().storage.from("generated-media").remove([path]);
      } catch {
        /* 스토리지 정리 실패는 무시하고 레코드는 삭제 */
      }
    }
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("product_assets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true };
}
