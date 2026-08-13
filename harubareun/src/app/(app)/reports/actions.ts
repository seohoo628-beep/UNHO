"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { parseCsv, findCol, toNum } from "@/lib/csv";

type Result = { ok: boolean; error?: string; inserted?: number; skipped?: number };

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

// 성과 CSV 일괄 반영. 헤더: 일자/브랜드/채널/도달/전환/매출 (한·영 대응).
// 브랜드는 이름 또는 약어(slug)로 매칭. 채널별 성과를 여러 채널에서 내보내 올려도 된다.
export async function importPerformanceCsv(formData: FormData): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") {
    return { ok: false, error: "권한이 없습니다." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "CSV 파일을 선택하세요." };
  }

  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { ok: false, error: "데이터 행이 없습니다." };

  const header = rows[0];
  const ci = {
    date: findCol(header, ["일자", "날짜", "date"]),
    brand: findCol(header, ["브랜드", "brand"]),
    channel: findCol(header, ["채널", "channel"]),
    reach: findCol(header, ["도달", "노출", "reach", "impress"]),
    conv: findCol(header, ["전환", "conversion", "주문", "order"]),
    revenue: findCol(header, ["매출", "revenue", "sales"]),
  };
  if (ci.brand < 0) {
    return { ok: false, error: "헤더에 '브랜드' 열이 필요합니다." };
  }

  const supabase = createSupabaseServerClient();
  const { data: brands } = await supabase.from("brands").select("id, name, slug");
  const brandMap = new Map<string, string>();
  for (const b of brands ?? []) {
    const row = b as { id: string; name: string; slug: string };
    brandMap.set(row.name.trim(), row.id);
    brandMap.set(row.slug.trim().toLowerCase(), row.id);
  }

  const records: Record<string, unknown>[] = [];
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const key = (r[ci.brand] ?? "").trim();
    const brandId = brandMap.get(key) ?? brandMap.get(key.toLowerCase());
    if (!brandId) {
      skipped++;
      continue;
    }
    const dateRaw = ci.date >= 0 ? (r[ci.date] ?? "").trim() : "";
    const recorded = /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : undefined;
    records.push({
      brand_id: brandId,
      channel: ci.channel >= 0 ? (r[ci.channel] ?? "").trim() || null : null,
      reach: ci.reach >= 0 ? toNum(r[ci.reach]) : null,
      conversions: ci.conv >= 0 ? toNum(r[ci.conv]) : null,
      revenue: ci.revenue >= 0 ? toNum(r[ci.revenue]) : null,
      recorded_at: recorded,
      note: "CSV 업로드",
      created_by: user.id,
    });
  }

  if (records.length === 0) {
    return { ok: false, error: `반영할 행이 없습니다(브랜드 매칭 실패 ${skipped}건). 브랜드명을 확인하세요.` };
  }

  const { error } = await supabase.from("performance").insert(records);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/reports");
  revalidatePath("/dashboard");
  return { ok: true, inserted: records.length, skipped };
}
