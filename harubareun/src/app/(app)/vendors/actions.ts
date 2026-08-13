"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

async function guard() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") {
    throw new Error("권한이 없습니다.");
  }
  return user;
}

export async function createVendor(formData: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "거래처명을 입력하세요." };
  const { error } = await supabase.from("vendors").insert({
    name,
    code: String(formData.get("code") ?? "").trim() || null,
    kind: String(formData.get("kind") ?? "").trim() || null,
    brand_name: String(formData.get("brand_name") ?? "").trim() || null,
    contact_name: String(formData.get("contact_name") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    payment_terms: String(formData.get("payment_terms") ?? "").trim() || null,
    lead_time_days: Number(formData.get("lead_time_days")) || null,
    moq: Number(formData.get("moq")) || null,
    contract_status: String(formData.get("contract_status") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/vendors");
  return { ok: true };
}

export async function createPO(formData: FormData): Promise<Result> {
  let user;
  try {
    user = await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const item = String(formData.get("item") ?? "").trim();
  if (!item) return { ok: false, error: "품목을 입력하세요." };
  const unitPrice = formData.get("unit_price");
  const { error } = await supabase.from("purchase_orders").insert({
    po_number: String(formData.get("po_number") ?? "").trim() || null,
    po_date: String(formData.get("po_date") ?? "") || null,
    vendor_id: String(formData.get("vendor_id") ?? "") || null,
    item,
    order_qty: Number(formData.get("order_qty")) || null,
    // 금액은 대표가 입력한 값만 사용. 비우면 확인 필요로 남는다.
    unit_price: unitPrice ? Number(unitPrice) || null : null,
    status: String(formData.get("status") ?? "발주"),
    note: String(formData.get("note") ?? "").trim() || null,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/vendors");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updatePOStatus(poId: string, status: string): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status })
    .eq("id", poId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/vendors");
  return { ok: true };
}
