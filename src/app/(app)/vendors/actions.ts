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
    ...taxInfo(formData),
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/vendors");
  return { ok: true };
}

// 세금계산서(공급받는자) 정보. 업태·종목·수신 이메일은 0097 마이그레이션 열이라
// 값이 있을 때만 보낸다(미적용 DB에서도 기존 등록이 깨지지 않게).
function taxInfo(formData: FormData): Record<string, string | null> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const out: Record<string, string | null> = {
    business_no: get("business_no") || null,
    ceo: get("ceo") || null,
    address: get("address") || null,
  };
  for (const k of ["biz_type", "biz_item", "tax_email"]) {
    const v = get(k);
    if (v) out[k] = v;
  }
  return out;
}

function friendly(msg: string): string {
  return /biz_type|biz_item|tax_email/.test(msg)
    ? "세금계산서 항목 열이 없습니다. 미수금 화면 안내 SQL(0097)을 먼저 실행하세요."
    : msg;
}

export async function updateVendorTaxInfo(vendorId: string, formData: FormData): Promise<Result> {
  try {
    await guard();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "권한 오류" };
  }
  const get = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("vendors")
    .update({
      business_no: get("business_no"),
      ceo: get("ceo"),
      address: get("address"),
      biz_type: get("biz_type"),
      biz_item: get("biz_item"),
      tax_email: get("tax_email"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", vendorId);
  if (error) return { ok: false, error: friendly(error.message) };
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
