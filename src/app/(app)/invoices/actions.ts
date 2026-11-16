"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeItems, totalsOf } from "@/lib/docs";
import { seoulToday } from "@/lib/time";

type Result = { ok: boolean; message: string; id?: string };
export type ManualInvoiceInput = {
  supplier: string; vendorId: string; buyerName: string; buyerBizNo: string; buyerCeo: string; buyerAddress: string;
  buyerBizType: string; buyerBizItem: string; buyerEmail: string; writeDate: string; taxType: string; purpose: string; note: string;
  items: { name: string; spec: string; qty: string; unit_price: string; supply: string }[];
};

async function guard() {
  const u = await requireAppUser();
  if (!canViewFinance(u)) throw new Error("권한이 없습니다.");
  return u;
}

/** 직접 입력 계산서 저장(발행 전 '작성' 상태만 수정 가능) */
export async function saveManualInvoice(id: string | null, f: ManualInvoiceInput): Promise<Result> {
  const u = await guard();
  const taxType = ["과세", "영세", "면세"].includes(f.taxType) ? f.taxType : "과세";
  const items = normalizeItems(f.items, taxType);
  if (!f.buyerName.trim()) return { ok: false, message: "공급받는자 상호를 입력하세요." };
  if (items.length === 0) return { ok: false, message: "품목을 한 줄 이상 입력하세요." };
  const t = totalsOf(items);
  const row = {
    supplier: f.supplier === "뷰티밤" ? "뷰티밤" : "운호컴퍼니",
    vendor_id: f.vendorId || null,
    buyer_name: f.buyerName.trim(), buyer_biz_no: f.buyerBizNo.trim() || null, buyer_ceo: f.buyerCeo.trim() || null,
    buyer_address: f.buyerAddress.trim() || null, buyer_biz_type: f.buyerBizType.trim() || null, buyer_biz_item: f.buyerBizItem.trim() || null,
    buyer_email: f.buyerEmail.trim() || null,
    write_date: /^\d{4}-\d{2}-\d{2}$/.test(f.writeDate) ? f.writeDate : seoulToday(),
    tax_type: taxType, purpose: f.purpose === "영수" ? "영수" : "청구",
    items, supply_total: t.supply, tax_total: t.tax, total: t.total, note: f.note.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const supabase = createSupabaseServerClient();
  if (id) {
    const { data: cur } = await supabase.from("manual_tax_invoices").select("status").eq("id", id).maybeSingle();
    if ((cur as { status?: string } | null)?.status !== "작성") return { ok: false, message: "발행·취소된 계산서는 수정할 수 없습니다." };
    const { error } = await supabase.from("manual_tax_invoices").update(row).eq("id", id);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/invoices");
    return { ok: true, message: "저장했습니다.", id };
  }
  const { data, error } = await supabase.from("manual_tax_invoices").insert({ ...row, created_by: u.id }).select("id").maybeSingle();
  if (error) return { ok: false, message: /manual_tax_invoices/.test(error.message) ? "DB 마이그레이션(0107) 적용이 필요합니다." : error.message };
  revalidatePath("/invoices");
  return { ok: true, message: "저장했습니다.", id: (data as { id?: string } | null)?.id };
}

/** 팝빌 즉시 발행(대표만). 운영 모드 성공 시 승인번호 기록. */
export async function issueManualInvoice(id: string): Promise<Result> {
  const u = await requireAppUser();
  const { isCeoUser } = await import("@/lib/ceo");
  if (!isCeoUser(u)) return { ok: false, message: "계산서 발행은 대표 계정만 할 수 있습니다." };
  const { getPopbillConfig, registIssue, describePopbillError } = await import("@/lib/popbill");
  const { buildTaxinvoiceLines, digits } = await import("@/lib/popbillInvoice");
  const cfg = await getPopbillConfig();
  if (!cfg) return { ok: false, message: "팝빌 키가 없습니다. 설정 → 팝빌 전자세금계산서에서 저장하세요." };
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("manual_tax_invoices").select("*").eq("id", id).maybeSingle();
  const m = data as any;
  if (!m) return { ok: false, message: "계산서를 찾지 못했습니다." };
  if (m.status !== "작성") return { ok: false, message: `이미 ${m.status}된 계산서입니다.` };
  const corpName = m.supplier === "뷰티밤" ? "뷰티밤㈜" : "㈜운호컴퍼니";
  const { data: corp } = await supabase.from("corporations").select("name, business_no, ceo, address, biz_type, biz_item, tax_contact, tax_email").eq("name", corpName).maybeSingle();
  const c = (corp ?? {}) as any;
  const mgtKey = (cfg.isTest ? "MT-" : "M-") + String(m.id).replace(/[^0-9a-f]/gi, "").slice(0, 20);
  const built = buildTaxinvoiceLines(
    { writeDate: m.write_date, taxType: m.tax_type, purpose: m.purpose, note: m.note, items: m.items ?? [] },
    { corpNum: c.business_no, corpName: c.name ?? corpName, ceo: c.ceo, address: c.address, bizType: c.biz_type, bizItem: c.biz_item, contact: c.tax_contact, email: c.tax_email },
    { corpNum: m.buyer_biz_no, corpName: m.buyer_name, ceo: m.buyer_ceo, address: m.buyer_address, bizType: m.buyer_biz_type, bizItem: m.buyer_biz_item, email: m.buyer_email },
    mgtKey
  );
  if (!built.ok) return { ok: false, message: `발행 전에 채워야 할 항목: ${built.missing.join(", ")}` };
  try {
    const res = await registIssue(cfg, digits(c.business_no), built.invoice, `운영플랫폼 직접발행 ${m.id}`);
    if (cfg.isTest) {
      await supabase.from("manual_tax_invoices").update({ issue_error: null }).eq("id", id);
      return { ok: true, message: `테스트 발행 성공(test.popbill.com, 국세청 미전송). 합계 ${built.total.toLocaleString("ko-KR")}원. 상태는 '작성' 그대로입니다.` };
    }
    const confirm = res.ntsConfirmNum || `팝빌 ${mgtKey}`;
    await supabase.from("manual_tax_invoices").update({ status: "발행", nts_confirm_num: confirm, popbill_mgt_key: mgtKey, issue_error: null, issued_at: new Date().toISOString() }).eq("id", id);
    revalidatePath("/invoices");
    return { ok: true, message: `발행했습니다. 승인번호 ${confirm} · 합계 ${built.total.toLocaleString("ko-KR")}원` };
  } catch (e) {
    const msg = describePopbillError(e as { code?: number; message?: string });
    await supabase.from("manual_tax_invoices").update({ issue_error: msg.slice(0, 500) }).eq("id", id);
    revalidatePath("/invoices");
    return { ok: false, message: msg };
  }
}

export async function setManualInvoiceStatus(id: string, status: "발행" | "취소"): Promise<Result> {
  await guard();
  const supabase = createSupabaseServerClient();
  const patch = status === "발행" ? { status, issued_at: new Date().toISOString() } : { status };
  const { error } = await supabase.from("manual_tax_invoices").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "작성");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/invoices");
  return { ok: true, message: status === "발행" ? "발행 완료로 표시했습니다(홈택스 등 다른 곳에서 발행한 경우)." : "취소했습니다." };
}

export async function deleteManualInvoice(id: string): Promise<Result> {
  await guard();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("manual_tax_invoices").delete().eq("id", id).neq("status", "발행");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/invoices");
  return { ok: true, message: "삭제했습니다." };
}
