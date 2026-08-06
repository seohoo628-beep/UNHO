"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { runMarketerForAllEnabled } from "@/lib/agents/run";

type Result = { ok: boolean; error?: string };

// 지금 즉시 전 브랜드 마케터 자동기획 실행(대표 전용). 크론을 기다리지 않고 테스트/수동 실행.
export async function runAllMarketerNow(): Promise<{
  ok: boolean;
  error?: string;
  queued?: number;
  blocked?: number;
  errored?: number;
  brands?: number;
}> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 실행할 수 있습니다." };
  try {
    const results = await runMarketerForAllEnabled();
    const queued = results.filter((r) => r.status === "queued").length;
    const blocked = results.filter((r) => r.status === "blocked").length;
    const errored = results.filter((r) => r.status === "error").length;
    revalidatePath("/approvals");
    return { ok: true, brands: results.length, queued, blocked, errored };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "실행 실패" };
  }
}

// 승인/반려는 대표만. 규제 검수 미통과분도 큐에 올라오며, 대표가 최종 판단한다.
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
    .select("id, compliance_status, approval_status, agent_type, title, brand_id")
    .eq("id", aiOutputId)
    .maybeSingle();

  if (!output) return { ok: false, error: "산출물을 찾을 수 없습니다." };
  // 규제 검수 미통과여도 승인 큐에 노출하고, 승인 여부는 대표가 결정한다.

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

  // 다음 액션: 승인 시 "집행 업무"를 자동 생성해 업무 보드에 올린다.
  if (decision === "approved") {
    const o = output as { agent_type: string; title: string | null; brand_id: string };
    const exec: Record<string, string> = {
      marketer: "콘텐츠 제작",
      md: "셀러 아웃리치",
      designer: "문서 작성",
    };
    await supabase.from("tasks").insert({
      brand_id: o.brand_id,
      title: `[집행] ${o.title ?? "승인된 산출물"}`,
      category: exec[o.agent_type] ?? "기타",
      ai_agent_type: o.agent_type,
      ai_output_id: aiOutputId, // 승인된 원문을 집행 화면에서 바로 볼 수 있게 연결
      assignee_kind: "user",
      status: "예정",
      note: "대표 승인 완료. 집행 센터에서 원문을 복사해 집행하고 결과 링크를 남긴다.",
      created_by: user.id,
    });
  }

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  return { ok: true };
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
