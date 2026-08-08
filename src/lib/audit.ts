import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type AuditInput = {
  actorId?: string | null;
  actorName?: string | null;
  action: "created" | "updated" | "deleted" | "status" | "approved" | "rejected";
  entity: string; // todo | ceo_todo | approval | leave | inventory | product_dev | assignee ...
  label?: string | null; // 대상 제목/이름
  detail?: string | null;
};

// 변경 이력 기록. 실패해도 호출부 흐름을 막지 않는다(테이블 없으면 조용히 무시).
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const svc = createSupabaseServiceClient();
    await svc.from("audit_logs").insert({
      actor_id: input.actorId ?? null,
      actor_name: input.actorName ?? null,
      action: input.action,
      entity: input.entity,
      entity_label: input.label ?? null,
      detail: input.detail ?? null,
    });
  } catch {
    /* 감사 로그 실패는 무시 */
  }
}
