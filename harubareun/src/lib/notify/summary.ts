import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { stockVerdict } from "@/lib/inventory";
import { seoulToday, isOverdue } from "@/lib/time";
import type { InventoryItem } from "@/lib/types";

// 대표 아침 알림 요약 텍스트를 만든다.
export async function buildMorningSummary(): Promise<string> {
  const svc = createSupabaseServiceClient();

  const [{ count: pending }, { count: blocked }, { data: tasks }, { data: inv }] =
    await Promise.all([
      svc
        .from("ai_outputs")
        .select("id", { count: "exact", head: true })
        .eq("compliance_status", "pass")
        .eq("approval_status", "pending"),
      svc
        .from("ai_outputs")
        .select("id", { count: "exact", head: true })
        .eq("compliance_status", "fail"),
      svc
        .from("tasks")
        .select("status, due_date, wait_target")
        .not("status", "in", "(완료,취소)")
        .limit(500),
      svc.from("inventory_items").select("*").limit(500),
    ]);

  const rows = (tasks ?? []) as { status: string; due_date: string | null; wait_target: string | null }[];
  const delayed = rows.filter((t) => t.status === "지연" || isOverdue(t.due_date, t.status)).length;
  const waitOwner = rows.filter((t) => (t.wait_target ?? "").includes("대표")).length;
  const reorder = ((inv ?? []) as InventoryItem[])
    .map((i) => stockVerdict(i).verdict)
    .filter((v) => v === "발주 임박" || v === "발주 필요").length;

  const lines = [
    `[하루바른·나아] ${seoulToday()} 아침 브리핑`,
    `승인 대기 ${pending ?? 0}건`,
    `검수 미통과 ${blocked ?? 0}건`,
    `지연 업무 ${delayed}건 / 대표 회신 대기 ${waitOwner}건`,
    `발주 임박·필요 ${reorder}품목`,
  ];
  return lines.join("\n");
}
