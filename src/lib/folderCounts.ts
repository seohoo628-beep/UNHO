import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { memoCache } from "@/lib/memoCache";

// 사이드바·홈 폴더 배지용 개수. 모든 페이지 이동마다 16개 count 쿼리를 날리던 것을
// 인스턴스 캐시(30초)로 묶는다. 배지는 "지난 방문 이후 새 항목" 표시라 30초 지연은 문제없다.
export type FolderCounts = { pending: number; counts: Record<string, number> };

const TTL = 30_000;

export async function getFolderCounts(): Promise<FolderCounts> {
  return memoCache("folder-counts", TTL, async () => {
    const svc = createSupabaseServiceClient();
    const cnt = (q: PromiseLike<{ count: number | null }>): Promise<number> =>
      Promise.resolve(q).then((r) => r.count ?? 0).catch(() => 0);
    const t = (name: string) => svc.from(name).select("id", { count: "exact", head: true });

    const [
      pending, execCount, resultCount, todoCount, ceoCount, planCount, meetCount, mlogCount,
      leaveCount, recvCount, payCount, crmCount, poCount, invCount, pdevCount, eapprCount,
    ] = await Promise.all([
      cnt(t("ai_outputs").eq("agent_type", "marketer").in("compliance_status", ["pass", "fail"]).eq("approval_status", "pending")),
      cnt(t("tasks").not("ai_output_id", "is", null).eq("ai_agent_type", "marketer").in("status", ["예정", "진행", "보류"])),
      cnt(t("tasks").eq("ai_agent_type", "marketer").eq("status", "완료")),
      cnt(t("todos").in("status", ["예정", "진행"])),
      cnt(t("ceo_todos").eq("done", false)),
      cnt(t("ai_outputs").in("agent_type", ["md", "designer"]).eq("approval_status", "pending")),
      cnt(t("meetings")),
      cnt(t("manager_logs")),
      cnt(t("leave_usages")),
      cnt(t("receivables").is("settled_at", null)),
      cnt(t("payables").is("settled_at", null)),
      cnt(t("crm_leads")),
      cnt(t("purchase_orders")),
      cnt(t("inventory_items")),
      cnt(t("product_developments")),
      cnt(t("approval_requests").eq("status", "pending")),
    ]);

    return {
      pending,
      counts: {
        "/execute": execCount,
        "/dashboard": resultCount,
        "/todos": todoCount,
        "/ceo-todos": ceoCount,
        "/planning": planCount,
        "/meetings": meetCount,
        "/work-logs": mlogCount,
        "/leave": leaveCount,
        "/receivables": recvCount,
        "/payables": payCount,
        "/crm": crmCount,
        "/vendors": poCount,
        "/inventory": invCount,
        "/product-dev": pdevCount,
        "/e-approval": eapprCount,
      },
    };
  });
}
