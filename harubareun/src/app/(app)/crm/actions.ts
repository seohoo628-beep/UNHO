"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { seoulToday } from "@/lib/time";

type Result = { ok: boolean; error?: string };

async function guardUser() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") throw new Error("권한이 없습니다.");
  return user;
}

export async function createLead(formData: FormData): Promise<Result> {
  let user;
  try {
    user = await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "이름을 입력하세요." };

  const { error } = await supabase.from("crm_leads").insert({
    name,
    kind: String(formData.get("kind") ?? "seller"),
    brand_id: String(formData.get("brand_id") ?? "") || null,
    handle: String(formData.get("handle") ?? "").trim() || null,
    contact: String(formData.get("contact") ?? "").trim() || null,
    product: String(formData.get("product") ?? "").trim() || null,
    source: String(formData.get("source") ?? "").trim() || null,
    stage: String(formData.get("stage") ?? "발굴"),
    next_follow_up: String(formData.get("next_follow_up") ?? "") || null,
    note: String(formData.get("note") ?? "").trim() || null,
    owner_user_id: user.id,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}

// 단계 변경 시 파이프라인 타임스탬프를 자동 기록한다.
export async function updateLeadStage(leadId: string, stage: string): Promise<Result> {
  try {
    await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { data: lead } = await supabase
    .from("crm_leads")
    .select("proposed_at, replied_at")
    .eq("id", leadId)
    .maybeSingle();

  const today = seoulToday();
  const patch: Record<string, unknown> = { stage };
  if (stage === "제안" && !lead?.proposed_at) patch.proposed_at = today;
  if (["회신", "협의", "성사"].includes(stage) && !lead?.replied_at) patch.replied_at = today;
  if (stage === "성사") {
    patch.result = "won";
    patch.closed_at = today;
  } else if (stage === "실패") {
    patch.result = "lost";
    patch.closed_at = today;
  }

  const { error } = await supabase.from("crm_leads").update(patch).eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/crm");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setFollowUp(leadId: string, date: string): Promise<Result> {
  try {
    await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("crm_leads")
    .update({ next_follow_up: date || null })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/crm");
  return { ok: true };
}
