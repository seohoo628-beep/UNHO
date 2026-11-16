"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { supplyOf, vatOf, SUPPLIERS, TAX_TYPES, INVOICE_KINDS } from "@/lib/taxInvoice";

type Result = { ok: boolean; error?: string };

export interface ReceivableInput {
  counterparty: string;
  item: string;
  billed: number;
  received: number;
  billDate: string;
  dueDate: string;
  note: string;
  /** 세금계산서 항목. 0097 마이그레이션 적용 전에는 보내지 않는다. */
  tax?: TaxFields;
}

export interface TaxFields {
  supplier: string;      // 운호컴퍼니 / 뷰티밤 / ""(미지정)
  vendorId: string;
  supplyDate: string;
  quantity: number | null;
  unitPrice: number | null;
  supplyAmount: number | null;
  taxType: string;
  invoiceKind: string;
  invoiceNo: string;
  invoiceIssuedAt: string;
}

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

function row(inp: ReceivableInput) {
  const base: Record<string, unknown> = {
    counterparty: inp.counterparty.trim(),
    item: inp.item?.trim() || null,
    billed: Number(inp.billed) || 0,
    received: Number(inp.received) || 0,
    bill_date: inp.billDate || null,
    due_date: inp.dueDate || null,
    note: inp.note?.trim() || null,
  };
  const t = inp.tax;
  if (!t) return base;
  const num = (v: number | null) => (v == null || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v));
  const taxType = (TAX_TYPES as readonly string[]).includes(t.taxType) ? t.taxType : "과세";
  const quantity = num(t.quantity);
  const unitPrice = num(t.unitPrice) != null ? Math.round(Number(t.unitPrice)) : null;
  const supply = supplyOf({ supplyAmount: num(t.supplyAmount), quantity, unitPrice });
  // 청구액을 비워 두면 공급가액+부가세로 채운다(수금 대상 금액).
  if (!base.billed && supply != null) base.billed = supply + vatOf(supply, taxType);
  return {
    ...base,
    supplier: (SUPPLIERS as readonly string[]).includes(t.supplier) ? t.supplier : null,
    vendor_id: t.vendorId || null,
    supply_date: t.supplyDate || null,
    quantity,
    unit_price: unitPrice,
    supply_amount: supply,
    tax_type: taxType,
    invoice_kind: (INVOICE_KINDS as readonly string[]).includes(t.invoiceKind) ? t.invoiceKind : "청구",
    invoice_no: t.invoiceNo?.trim() || null,
    invoice_issued_at: t.invoiceIssuedAt || null,
  };
}

export async function createReceivable(inp: ReceivableInput): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!inp.counterparty?.trim()) return { ok: false, error: "거래처를 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("receivables").insert({ ...row(inp), created_by: u.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receivables");
  return { ok: true };
}

export async function updateReceivable(id: string, inp: ReceivableInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("receivables")
    .update({ ...row(inp), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receivables");
  return { ok: true };
}

export async function deleteReceivable(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("receivables").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receivables");
  return { ok: true };
}

// 부분 수금 기재: 입금액을 amount(원)만큼 누적한다. 청구액을 다 채우면 자동 완료(가능 시).
export async function addReceipt(id: string, amount: number): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const add = Math.max(0, Math.round(Number(amount) || 0));
  if (add <= 0) return { ok: false, error: "수금 금액을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("receivables").select("billed,received").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "항목을 찾을 수 없습니다." };
  const billed = Number((data as any).billed) || 0;
  const received = (Number((data as any).received) || 0) + add;
  const patch: Record<string, unknown> = { received, updated_at: new Date().toISOString() };
  if (billed > 0 && received >= billed) patch.settled_at = new Date().toISOString();
  let { error } = await supabase.from("receivables").update(patch).eq("id", id);
  if (error && /settled_at/.test(error.message)) {
    delete (patch as any).settled_at;
    ({ error } = await supabase.from("receivables").update(patch).eq("id", id));
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receivables");
  return { ok: true };
}

// 수금완료 처리(완료 시각 기록 + 입금액을 청구액으로 채움) / 되돌리기
export async function settleReceivable(id: string, done: boolean): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  let patch: Record<string, unknown> = { settled_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
  if (done) {
    const { data } = await supabase.from("receivables").select("billed").eq("id", id).maybeSingle();
    const billed = Number((data as { billed?: number } | null)?.billed) || 0;
    patch = { ...patch, received: billed };
  }
  const { error } = await supabase.from("receivables").update(patch).eq("id", id);
  if (error && /settled_at/.test(error.message)) {
    return { ok: false, error: "완료 기능을 쓰려면 DB에 settled_at 컬럼을 추가해야 합니다(화면 안내 SQL 실행)." };
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receivables");
  return { ok: true };
}

// ── 팝빌 전자세금계산서 즉시 발행 ─────────────────────────────────────────────
// 대표만, 건마다 확인 후 누른다. 미수금 1건 = 계산서 1장. 운영 모드에서 성공하면 승인번호·발행일을 장부에 기록.
// 테스트 모드(팝빌 테스트베드)는 국세청으로 가지 않으므로 장부를 바꾸지 않는다.
export async function issueTaxInvoice(id: string): Promise<{ ok: boolean; message: string }> {
  const u = await requireAppUser();
  const { isCeoUser } = await import("@/lib/ceo");
  if (!isCeoUser(u)) return { ok: false, message: "계산서 발행은 대표 계정만 할 수 있습니다." };
  const { getPopbillConfig, registIssue, describePopbillError } = await import("@/lib/popbill");
  const { buildTaxinvoice, mgtKeyOf, digits } = await import("@/lib/popbillInvoice");
  const { seoulToday } = await import("@/lib/time");
  const cfg = await getPopbillConfig();
  if (!cfg) return { ok: false, message: "팝빌 키가 없습니다. 설정 → 팝빌 전자세금계산서에서 LinkID·SecretKey를 저장하세요." };

  const supabase = createSupabaseServerClient();
  const { data: r, error } = await supabase
    .from("receivables")
    .select("id, item, supplier, supply_date, quantity, unit_price, supply_amount, tax_type, invoice_kind, invoice_no, note, vendors(name, business_no, ceo, address, biz_type, biz_item, tax_email, email)")
    .eq("id", id)
    .maybeSingle();
  if (error || !r) return { ok: false, message: "미수금 건을 찾지 못했습니다." };
  const rec = r as any;
  if (rec.invoice_no) return { ok: false, message: `이미 발행된 건입니다(승인번호 ${rec.invoice_no}).` };
  if (!rec.supplier) return { ok: false, message: "공급자(운호컴퍼니/뷰티밤)를 먼저 지정하세요." };
  if (!rec.vendors) return { ok: false, message: "매출처(거래처)를 먼저 연결하세요." };

  const corpName = rec.supplier === "뷰티밤" ? "뷰티밤㈜" : "㈜운호컴퍼니";
  let { data: corp } = await supabase.from("corporations").select("name, business_no, ceo, address, biz_type, biz_item, tax_contact, tax_email").eq("name", corpName).maybeSingle();
  if (!corp) ({ data: corp } = await supabase.from("corporations").select("name, business_no, ceo, address").eq("name", corpName).maybeSingle());
  const c = (corp ?? {}) as any;
  const v = rec.vendors;
  const mgtKey = mgtKeyOf(rec.id, cfg.isTest);
  const built = buildTaxinvoice(
    { id: rec.id, item: rec.item, supplyDate: rec.supply_date, quantity: rec.quantity, unitPrice: rec.unit_price, supplyAmount: rec.supply_amount, taxType: rec.tax_type, invoiceKind: rec.invoice_kind, note: rec.note },
    { corpNum: c.business_no, corpName: c.name ?? corpName, ceo: c.ceo, address: c.address, bizType: c.biz_type, bizItem: c.biz_item, contact: c.tax_contact, email: c.tax_email },
    { corpNum: v.business_no, corpName: v.name, ceo: v.ceo, address: v.address, bizType: v.biz_type, bizItem: v.biz_item, email: v.tax_email || v.email },
    mgtKey,
    seoulToday()
  );
  if (!built.ok) return { ok: false, message: `발행 전에 채워야 할 항목: ${built.missing.join(", ")}` };

  try {
    const res = await registIssue(cfg, digits(c.business_no), built.invoice, `운영플랫폼 미수금 ${rec.id}`);
    if (cfg.isTest) {
      return { ok: true, message: `테스트 발행 성공(test.popbill.com, 국세청 미전송). 합계 ${built.total.toLocaleString("ko-KR")}원. 장부는 바꾸지 않았습니다.` };
    }
    const confirm = res.ntsConfirmNum || `팝빌 ${mgtKey}`;
    await supabase
      .from("receivables")
      .update({ invoice_no: confirm, invoice_issued_at: seoulToday(), popbill_mgt_key: mgtKey, invoice_issue_error: null })
      .eq("id", id);
    revalidatePath("/receivables");
    return { ok: true, message: `발행했습니다. 승인번호 ${confirm} · 합계 ${built.total.toLocaleString("ko-KR")}원` };
  } catch (e) {
    const msg = describePopbillError(e as { code?: number; message?: string });
    await supabase.from("receivables").update({ invoice_issue_error: msg.slice(0, 500) }).eq("id", id);
    return { ok: false, message: msg };
  }
}
