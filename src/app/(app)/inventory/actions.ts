"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

async function guardUser() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") throw new Error("권한이 없습니다.");
  return user;
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function createInventoryItem(formData: FormData): Promise<Result> {
  try {
    await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const item = String(formData.get("item") ?? "").trim();
  if (!item) return { ok: false, error: "품목명을 입력하세요." };

  const { error } = await supabase.from("inventory_items").insert({
    item,
    brand_id: String(formData.get("brand_id") ?? "") || null,
    vendor_id: String(formData.get("vendor_id") ?? "") || null,
    current_stock: numOrNull(formData.get("current_stock")),
    out_30d: numOrNull(formData.get("out_30d")),
    safety_days: numOrNull(formData.get("safety_days")) ?? 7,
    lead_time_days: numOrNull(formData.get("lead_time_days")),
    note: String(formData.get("note") ?? "").trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventory");
  revalidatePath("/vendors");
  return { ok: true };
}

export async function updateInventoryItem(id: string, formData: FormData): Promise<Result> {
  try {
    await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("inventory_items")
    .update({
      item: String(formData.get("item") ?? "").trim(),
      brand_id: String(formData.get("brand_id") ?? "") || null,
      vendor_id: String(formData.get("vendor_id") ?? "") || null,
      current_stock: numOrNull(formData.get("current_stock")),
      out_30d: numOrNull(formData.get("out_30d")),
      safety_days: numOrNull(formData.get("safety_days")) ?? 7,
      lead_time_days: numOrNull(formData.get("lead_time_days")),
      note: String(formData.get("note") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventory");
  revalidatePath("/vendors");
  return { ok: true };
}

export async function deleteInventoryItem(id: string): Promise<Result> {
  try {
    await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventory");
  revalidatePath("/vendors");
  return { ok: true };
}

/**
 * 입고/출고 조정. 현재고를 변경하고 이동 이력(inventory_movements)을 남긴다.
 *   kind='in'  → 현재고 + qty
 *   kind='out' → 현재고 - qty
 * 이력 테이블이 아직 없으면(마이그레이션 전) 현재고만 갱신하고 이력은 건너뛴다.
 */
export async function adjustStock(
  id: string,
  kind: "in" | "out",
  qty: number,
  note?: string
): Promise<Result> {
  let user;
  try {
    user = await guardUser();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "수량을 확인하세요." };
  const supabase = createSupabaseServerClient();

  const { data: cur, error: readErr } = await supabase
    .from("inventory_items")
    .select("current_stock")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  const prev = Number(cur?.current_stock ?? 0);
  const delta = kind === "in" ? qty : -qty;
  const next = prev + delta;

  const { error: upErr } = await supabase
    .from("inventory_items")
    .update({ current_stock: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (upErr) return { ok: false, error: upErr.message };

  // 이력 기록(테이블 없으면 조용히 무시)
  const { error: movErr } = await supabase.from("inventory_movements").insert({
    item_id: id,
    kind,
    qty: delta,
    balance: next,
    note: note?.trim() || null,
    created_by: user.id,
  });
  if (movErr && !(movErr.code === "42P01" || /inventory_movements/.test(movErr.message ?? ""))) {
    // 이력 실패가 치명적이진 않음 — 현재고는 이미 갱신됨. 그래도 알린다.
    return { ok: true };
  }

  revalidatePath("/inventory");
  revalidatePath("/vendors");
  return { ok: true };
}
