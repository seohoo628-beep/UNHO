"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { generateThumbnailForOutput } from "@/lib/media/generate";
import { falKey } from "@/lib/media/fal";

type Result = { ok: boolean; error?: string; imageUrl?: string; imageError?: string };

// 승인/반려는 대표만. 산출물이 규제 검수를 통과한 상태여야 한다.
async function decide(
  aiOutputId: string,
  decision: "approved" | "rejected",
  reason: string
): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner") {
    return { ok: false, error: "승인·반려는 대표만 할 수 있습니다." };
  }
  const supabase = createSupabaseServerClient();

  const { data: output } = await supabase
    .from("ai_outputs")
    .select("id, compliance_status, approval_status")
    .eq("id", aiOutputId)
    .maybeSingle();

  if (!output) return { ok: false, error: "산출물을 찾을 수 없습니다." };
  if (output.compliance_status !== "pass") {
    return { ok: false, error: "규제 검수를 통과하지 않은 산출물입니다." };
  }

  const { error: aErr } = await supabase.from("approvals").insert({
    ai_output_id: aiOutputId,
    approver_user_id: user.id,
    decision,
    reason: reason?.trim() || null,
  });
  if (aErr) return { ok: false, error: aErr.message };

  const { error: uErr } = await supabase
    .from("ai_outputs")
    .update({ approval_status: decision })
    .eq("id", aiOutputId);
  if (uErr) return { ok: false, error: uErr.message };

  // 승인 시 썸네일 자동 생성(서버에서 확실히 처리). 실패해도 승인은 유지.
  let imageUrl: string | undefined;
  let imageError: string | undefined;
  if (decision === "approved" && falKey()) {
    const g = await generateThumbnailForOutput(aiOutputId, user.id);
    if (g.ok) imageUrl = g.url;
    else imageError = g.error;
  }

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  return { ok: true, imageUrl, imageError };
}

export async function approveOutput(aiOutputId: string, reason: string) {
  return decide(aiOutputId, "approved", reason);
}

export async function rejectOutput(aiOutputId: string, reason: string) {
  return decide(aiOutputId, "rejected", reason);
}

// 수정 요청은 대표·직원 모두 가능.
export async function requestRevision(
  aiOutputId: string,
  reason: string
): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") {
    return { ok: false, error: "권한이 없습니다." };
  }
  if (!reason?.trim()) {
    return { ok: false, error: "수정 요청 내용을 입력하세요." };
  }
  const supabase = createSupabaseServerClient();

  const { error: aErr } = await supabase.from("approvals").insert({
    ai_output_id: aiOutputId,
    approver_user_id: user.id,
    decision: "revision_requested",
    reason: reason.trim(),
  });
  if (aErr) return { ok: false, error: aErr.message };

  const { error: uErr } = await supabase
    .from("ai_outputs")
    .update({ approval_status: "revision_requested", revision_note: reason.trim() })
    .eq("id", aiOutputId);
  if (uErr) return { ok: false, error: uErr.message };

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  return { ok: true };
}
