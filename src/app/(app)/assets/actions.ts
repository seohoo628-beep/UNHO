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
  folder: string;
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
    folder: inp.folder?.trim() || null,
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

// 빈 폴더 생성(중복이면 그대로 성공 처리).
export async function createFolder(name: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const nm = (name || "").trim();
  if (!nm) return { ok: false, error: "폴더 이름을 입력하세요." };
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("asset_folders").insert({ name: nm });
  if (error && !/duplicate|unique/i.test(error.message)) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true };
}

// 자료를 다른 폴더로 이동(드래그&드롭). folder="" 이면 미분류.
export async function moveAsset(id: string, folder: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("product_assets")
    .update({ folder: folder.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assets");
  return { ok: true };
}

// 폴더 이름 변경(마지막 경로 세그먼트). 하위폴더·소속 자료까지 접두어 일괄 변경.
export async function renameFolder(oldPath: string, newName: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const oldp = (oldPath || "").trim();
  const seg = (newName || "").trim().replace(/\//g, " ");
  if (!oldp || !seg) return { ok: false, error: "이름을 입력하세요." };
  const parent = oldp.includes("/") ? oldp.slice(0, oldp.lastIndexOf("/") + 1) : "";
  const newp = parent + seg;
  if (newp === oldp) return { ok: true };
  const svc = createSupabaseServiceClient();

  const { data: fols } = await svc.from("asset_folders").select("id, name");
  for (const f of (fols ?? []) as { id: string; name: string }[]) {
    if (f.name === oldp || f.name.startsWith(oldp + "/")) {
      await svc.from("asset_folders").update({ name: newp + f.name.slice(oldp.length) }).eq("id", f.id);
    }
  }
  const { data: as } = await svc.from("product_assets").select("id, folder");
  for (const a of (as ?? []) as { id: string; folder: string | null }[]) {
    const fv = a.folder ?? "";
    if (fv === oldp || fv.startsWith(oldp + "/")) {
      await svc.from("product_assets").update({ folder: newp + fv.slice(oldp.length) }).eq("id", a.id);
    }
  }
  revalidatePath("/assets");
  return { ok: true };
}

// 폴더 삭제(하위폴더 포함). 소속 자료는 미분류로.
export async function deleteFolder(path: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const p = (path || "").trim();
  if (!p) return { ok: false, error: "폴더가 없습니다." };
  const svc = createSupabaseServiceClient();
  const { data: fols } = await svc.from("asset_folders").select("id, name");
  const delIds = ((fols ?? []) as { id: string; name: string }[])
    .filter((f) => f.name === p || f.name.startsWith(p + "/"))
    .map((f) => f.id);
  if (delIds.length) await svc.from("asset_folders").delete().in("id", delIds);
  const { data: as } = await svc.from("product_assets").select("id, folder");
  const affIds = ((as ?? []) as { id: string; folder: string | null }[])
    .filter((a) => (a.folder ?? "") === p || (a.folder ?? "").startsWith(p + "/"))
    .map((a) => a.id);
  if (affIds.length) await svc.from("product_assets").update({ folder: null }).in("id", affIds);
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
