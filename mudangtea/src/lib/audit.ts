import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type AuditInput = {
  actorId?: string | null;
  actorName?: string | null;
  action: "created" | "updated" | "deleted";
  entity: string;
  label?: string | null;
  detail?: string | null;
};

// 변경 이력은 운호 플랫폼과 같은 audit_logs 표에 남긴다. 실패해도 흐름을 막지 않는다.
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
    /* 무시 */
  }
}
