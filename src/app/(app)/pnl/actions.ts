"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { fetchPnlRows, extractPnlKpis } from "@/lib/pnl";

type Result = { ok: boolean; error?: string };

// 지금 시트를 읽어 오늘자 KPI 스냅샷을 저장한다.
export async function savePnlSnapshot(): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") {
    return { ok: false, error: "권한이 없습니다." };
  }
  const sheet = await fetchPnlRows();
  if (!sheet.ok || !sheet.rows) return { ok: false, error: sheet.error ?? "시트 읽기 실패" };

  const kpi = extractPnlKpis(sheet.rows);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("pnl_snapshots").insert({ ...kpi, raw: kpi });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pnl");
  revalidatePath("/dashboard");
  return { ok: true };
}
