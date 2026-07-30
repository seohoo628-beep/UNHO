"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

// 집행 후 성과 기록. 매출 등 금액은 대표 확정값만 입력한다.
export async function recordPerformance(formData: FormData): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") {
    return { ok: false, error: "권한이 없습니다." };
  }
  const supabase = createSupabaseServerClient();

  const brandId = String(formData.get("brand_id") ?? "");
  if (!brandId) return { ok: false, error: "브랜드를 선택하세요." };

  const num = (k: string) => {
    const v = formData.get(k);
    return v ? Number(v) || null : null;
  };

  const { error } = await supabase.from("performance").insert({
    brand_id: brandId,
    ai_output_id: String(formData.get("ai_output_id") ?? "") || null,
    channel: String(formData.get("channel") ?? "").trim() || null,
    reach: num("reach"),
    conversions: num("conversions"),
    revenue: num("revenue"),
    note: String(formData.get("note") ?? "").trim() || null,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reports");
  return { ok: true };
}
