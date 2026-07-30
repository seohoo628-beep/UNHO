"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

// 진행 보고: 배정된 업무의 상태·메모 갱신. RLS가 자기 배정분만 허용한다.
export async function reportProgress(
  taskId: string,
  status: string,
  note: string
): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "vendor") return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status, note: note?.trim() || null })
    .eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal");
  return { ok: true };
}

// 산출물 업로드: Supabase Storage 버킷 'vendor-uploads' 에 저장하고 attachments 기록.
// 서버(service_role)로 업로드하되, 업로더 검증은 세션으로 한다.
export async function uploadDeliverable(formData: FormData): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "vendor" || !user.vendor_id) {
    return { ok: false, error: "외주업체 계정만 업로드할 수 있습니다." };
  }
  const taskId = String(formData.get("task_id") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "파일을 선택하세요." };
  }

  const svc = createSupabaseServiceClient();

  // 이 업무가 본인 배정분인지 확인
  const { data: task } = await svc
    .from("tasks")
    .select("id, assignee_vendor_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task || task.assignee_vendor_id !== user.vendor_id) {
    return { ok: false, error: "본인에게 배정된 업무가 아닙니다." };
  }

  const safeName = file.name.replace(/[^\w.\-가-힣]/g, "_");
  const path = `${user.vendor_id}/${taskId}/${Date.now()}_${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await svc.storage
    .from("vendor-uploads")
    .upload(path, buf, { contentType: file.type || undefined, upsert: false });
  if (upErr) {
    return {
      ok: false,
      error:
        "업로드 실패: " +
        upErr.message +
        " (Supabase Storage에 'vendor-uploads' 버킷이 필요합니다)",
    };
  }

  const { error: aErr } = await svc.from("attachments").insert({
    task_id: taskId,
    vendor_id: user.vendor_id,
    storage_path: path,
    file_name: file.name,
    uploaded_by: user.id,
  });
  if (aErr) return { ok: false, error: aErr.message };

  revalidatePath("/portal");
  return { ok: true };
}
