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
  // KPI를 하나도 못 찾으면 저장하지 않고 원인을 알린다.
  const anyValue = Object.values(kpi).some((v) => v != null);
  if (!anyValue) {
    return {
      ok: false,
      error:
        "시트는 읽었으나 KPI를 찾지 못했습니다. 시트 상단 KPI 카드(총 매출·영업 이익 등)가 있는 탭(gid)인지 확인하세요.",
    };
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("pnl_snapshots").insert({ ...kpi, raw: kpi });
  if (error) {
    const msg = /pnl_snapshots|relation|does not exist/i.test(error.message)
      ? "pnl_snapshots 테이블이 없습니다. 마이그레이션 0010을 먼저 실행하세요."
      : error.message;
    return { ok: false, error: msg };
  }

  revalidatePath("/pnl");
  revalidatePath("/dashboard");
  return { ok: true };
}
