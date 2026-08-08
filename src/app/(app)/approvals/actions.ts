"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { runMarketerForAllEnabled, runMarketerForBrand } from "@/lib/agents/run";
import { renderBrandThumb, type ThumbAspect } from "@/lib/media/thumb";

type Result = { ok: boolean; error?: string };

// 승인 화면에서 제품컷 기반 썸네일 1장 생성(업무 생성 전, 미리 만들어 담아둔다).
export async function generateApprovalThumb(
  aiOutputId: string,
  aspect: ThumbAspect,
  concept?: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 사용할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const { data: o } = await supabase.from("ai_outputs").select("brand_id").eq("id", aiOutputId).maybeSingle();
  const brandId = (o as { brand_id: string | null } | null)?.brand_id ?? null;
  return renderBrandThumb({ brandId, aspect, concept, keyPrefix: aiOutputId });
}

// 승인 + (선택)썸네일 첨부. complete=true면 집행센터를 건너뛰고 바로 '완료'로 → 콘텐츠 결과물.
export async function approveMarketer(
  aiOutputId: string,
  opts: { thumbUrls?: string[]; complete: boolean; reason?: string }
): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "승인은 대표만 할 수 있습니다." };
  const supabase = createSupabaseServerClient();

  const { data: output } = await supabase
    .from("ai_outputs")
    .select("id, agent_type, title, brand_id")
    .eq("id", aiOutputId)
    .maybeSingle();
  if (!output) return { ok: false, error: "산출물을 찾을 수 없습니다." };

  await supabase.from("approvals").insert({
    ai_output_id: aiOutputId,
    approver_user_id: user.id,
    decision: "approved",
    reason: opts.reason?.trim() || null,
  });
  const { error: uErr } = await supabase.from("ai_outputs").update({ approval_status: "approved" }).eq("id", aiOutputId);
  if (uErr) return { ok: false, error: uErr.message };

  const o = output as { agent_type: string; title: string | null; brand_id: string };
  const cat: Record<string, string> = { marketer: "콘텐츠 제작", md: "셀러 아웃리치", designer: "문서 작성" };
  const thumbs = (opts.thumbUrls ?? []).filter(Boolean);

  const base: Record<string, unknown> = {
    brand_id: o.brand_id,
    title: `[집행] ${o.title ?? "승인된 산출물"}`,
    category: cat[o.agent_type] ?? "기타",
    ai_agent_type: o.agent_type,
    ai_output_id: aiOutputId,
    assignee_kind: "user",
    status: opts.complete ? "완료" : "예정",
    note: opts.complete
      ? "대표 승인·집행 완료(썸네일 포함) → 콘텐츠 결과물."
      : "대표 승인 완료. 집행 센터에서 집행한다.",
    created_by: user.id,
  };
  if (opts.complete) base.completed_date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

  // thumb_urls 컬럼이 있으면 함께 저장, 없으면(마이그레이션 전) 제외하고 저장.
  let { error } = await supabase.from("tasks").insert({ ...base, thumb_urls: thumbs });
  if (error && /thumb_urls/.test(error.message)) {
    ({ error } = await supabase.from("tasks").insert(base));
  }
  if (error) return { ok: false, error: error.message };

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath("/execute");
  revalidatePath("/tasks");
  return { ok: true };
}

// 대기 중인 마케터 산출물을 전부 '썸네일 생성 + 승인 + 결과물 완료' 처리(대표 전용).
// 개별 실패에 강함: 썸네일이 실패해도 승인·완료는 진행한다.
export async function approveAllMarketer(
  aspect: ThumbAspect = "square_hd",
  concept?: string
): Promise<{ ok: boolean; approved?: number; thumbFailed?: number; error?: string }> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "승인은 대표만 할 수 있습니다." };
  const supabase = createSupabaseServerClient();

  const { data } = await supabase
    .from("ai_outputs")
    .select("id, brand_id")
    .eq("agent_type", "marketer")
    .in("compliance_status", ["pass", "fail"])
    .eq("approval_status", "pending");
  const rows = (data ?? []) as { id: string; brand_id: string | null }[];
  if (rows.length === 0) return { ok: true, approved: 0, thumbFailed: 0 };

  let approved = 0;
  let thumbFailed = 0;

  // 병렬 처리(썸네일 생성은 내부에 재시도·백오프 있음).
  await Promise.all(
    rows.map(async (r) => {
      let thumbs: string[] = [];
      try {
        const t = await renderBrandThumb({ brandId: r.brand_id, aspect, concept, keyPrefix: r.id });
        if (t.ok && t.url) thumbs = [t.url];
        else thumbFailed++;
      } catch {
        thumbFailed++;
      }
      try {
        const res = await approveMarketer(r.id, { thumbUrls: thumbs, complete: true });
        if (res.ok) approved++;
      } catch {
        /* 개별 승인 실패는 건너뛴다 */
      }
    })
  );

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath("/execute");
  return { ok: true, approved, thumbFailed };
}

// 특정 브랜드만 지금 즉시 자동기획 실행(대표 전용).
export async function runMarketerForBrandNow(
  brandId: string,
  promo?: string
): Promise<{ ok: boolean; error?: string; status?: string; brand?: string }> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 실행할 수 있습니다." };
  if (!brandId) return { ok: false, error: "브랜드를 선택하세요." };
  try {
    const r = await runMarketerForBrand(brandId, promo?.trim() ? { promo: promo.trim() } : {});
    revalidatePath("/approvals");
    return { ok: true, status: r.status, brand: r.brand };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "실행 실패" };
  }
}

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
