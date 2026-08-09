"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";

// 백업 대상 테이블. 없는 테이블은 건너뛴다.
const TABLES = [
  "users",
  "brands",
  "todos",
  "todo_comments",
  "ceo_todos",
  "notifications",
  "approval_requests",
  "audit_logs",
  "inventory_items",
  "inventory_movements",
  "product_developments",
  "receivables",
  "payables",
  "purchase_orders",
  "vendors",
  "crm_leads",
  "leave_members",
  "leave_usages",
  "meetings",
  "manager_logs",
  "daily_checks",
  "performance",
  "pnl_snapshots",
  "partner_companies",
  "partner_posts",
  "partner_post_comments",
];

export type ExportResult = {
  ok: boolean;
  error?: string;
  generatedAt?: string;
  tables?: Record<string, Record<string, unknown>[]>;
  counts?: Record<string, number>;
};

export async function exportAllData(): Promise<ExportResult> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 백업할 수 있습니다." };

  const svc = createSupabaseServiceClient();
  const tables: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};

  await Promise.all(
    TABLES.map(async (name) => {
      try {
        const { data, error } = await svc.from(name).select("*").limit(10000);
        if (error) return; // 없는 테이블 등은 스킵
        tables[name] = (data ?? []) as Record<string, unknown>[];
        counts[name] = tables[name].length;
      } catch {
        /* 스킵 */
      }
    })
  );

  return { ok: true, generatedAt: new Date().toISOString(), tables, counts };
}
