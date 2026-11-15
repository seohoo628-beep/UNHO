"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import { mapRows, type ImportKind } from "@/lib/dataImport";

const TABLE: Record<ImportKind, string> = { cs: "cs_inquiries", shipments: "shipments", crm: "crm_leads" };

export async function importRows(kind: ImportKind, text: string): Promise<{ ok: boolean; message: string }> {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return { ok: false, message: "권한이 없습니다." };
  if (!TABLE[kind]) return { ok: false, message: "알 수 없는 자료 종류입니다." };
  const { rows, skipped } = mapRows(kind, text, seoulToday());
  if (rows.length === 0) return { ok: false, message: "저장할 행이 없습니다. 첫 줄 머리글과 필수 열(내용·품목·이름)을 확인하세요." };
  if (rows.length > 2000) return { ok: false, message: "한 번에 2,000행까지 넣을 수 있습니다. 나눠서 붙여넣어 주세요." };
  const supabase = createSupabaseServerClient();
  let saved = 0;
  let dup = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({ ...r, created_by: u.id }));
    const { error } = await supabase.from(TABLE[kind]).insert(chunk);
    if (!error) { saved += chunk.length; continue; }
    if (/relation .* does not exist|Could not find the table|schema cache/i.test(error.message)) {
      return { ok: false, message: `DB에 ${TABLE[kind]} 테이블이 없습니다. Supabase에서 0102 마이그레이션을 실행하세요.` };
    }
    // 송장번호 중복 등은 한 줄씩 넣어 가능한 것만 저장한다.
    for (const row of chunk) {
      const { error: e1 } = await supabase.from(TABLE[kind]).insert(row);
      if (!e1) saved++;
      else if (e1.code === "23505") dup++;
      else return { ok: false, message: `${saved}행 저장 후 오류: ${e1.message}` };
    }
  }
  revalidatePath("/data-import");
  return { ok: true, message: `${saved}행 저장${dup ? ` · 중복 ${dup}행 건너뜀` : ""}${skipped ? ` · 필수값 없는 ${skipped}행 제외` : ""}` };
}

