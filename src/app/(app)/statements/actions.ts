"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth";
import { canViewFinance } from "@/lib/finance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeItems, totalsOf, nextDocNo } from "@/lib/docs";
import { seoulToday } from "@/lib/time";

type Result = { ok: boolean; message: string; id?: string };
export type StatementInput = {
  supplier: string; vendorId: string; receiverName: string; receiverBizNo: string; receiverCeo: string; receiverAddress: string; receiverEmail: string;
  issueDate: string; taxType: string; note: string;
  items: { name: string; spec: string; qty: string; unit_price: string; supply: string }[];
};

async function guard() {
  const u = await requireAppUser();
  if (!canViewFinance(u)) throw new Error("권한이 없습니다.");
  return u;
}

export async function saveStatement(id: string | null, s: StatementInput): Promise<Result> {
  const u = await guard();
  const taxType = ["과세", "영세", "면세"].includes(s.taxType) ? s.taxType : "과세";
  const items = normalizeItems(s.items, taxType);
  if (!s.receiverName.trim()) return { ok: false, message: "공급받는자(거래처)를 입력하세요." };
  if (items.length === 0) return { ok: false, message: "품목을 한 줄 이상 입력하세요." };
  const t = totalsOf(items);
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(s.issueDate) ? s.issueDate : seoulToday();
  const supabase = createSupabaseServerClient();
  const row = {
    supplier: s.supplier === "뷰티밤" ? "뷰티밤" : "운호컴퍼니",
    vendor_id: s.vendorId || null,
    receiver_name: s.receiverName.trim(), receiver_biz_no: s.receiverBizNo.trim() || null, receiver_ceo: s.receiverCeo.trim() || null,
    receiver_address: s.receiverAddress.trim() || null, receiver_email: s.receiverEmail.trim() || null,
    issue_date: issueDate, tax_type: taxType, items, supply_total: t.supply, tax_total: t.tax, total: t.total,
    note: s.note.trim() || null, updated_at: new Date().toISOString(),
  };
  if (id) {
    const { data: cur } = await supabase.from("trade_statements").select("status").eq("id", id).maybeSingle();
    if ((cur as { status?: string } | null)?.status === "발급") return { ok: false, message: "이미 발급한 명세서는 수정할 수 없습니다. 취소 후 새로 작성하세요." };
    const { error } = await supabase.from("trade_statements").update(row).eq("id", id);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/statements");
    return { ok: true, message: "저장했습니다.", id };
  }
  const { data: same } = await supabase.from("trade_statements").select("doc_no").like("doc_no", `TS-${issueDate.replace(/-/g, "")}-%`);
  const doc_no = nextDocNo(issueDate, ((same ?? []) as { doc_no: string }[]).map((x) => x.doc_no));
  const { data, error } = await supabase.from("trade_statements").insert({ ...row, doc_no, created_by: u.id }).select("id").maybeSingle();
  if (error) return { ok: false, message: /trade_statements/.test(error.message) ? "DB 마이그레이션(0105) 적용이 필요합니다." : error.message };
  revalidatePath("/statements");
  return { ok: true, message: `${doc_no} 작성했습니다.`, id: (data as { id?: string } | null)?.id };
}

export async function setStatementStatus(id: string, status: "작성" | "발급" | "취소"): Promise<Result> {
  await guard();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("trade_statements").update({ status, issued_at: status === "발급" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/statements");
  return { ok: true, message: status === "발급" ? "발급 완료로 표시했습니다." : status === "취소" ? "취소했습니다." : "작성 상태로 되돌렸습니다." };
}

export async function deleteStatement(id: string): Promise<Result> {
  await guard();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("trade_statements").delete().eq("id", id).neq("status", "발급");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/statements");
  return { ok: true, message: "삭제했습니다." };
}

/** 팝빌 전자 거래명세서 발행(대표만). 공급받는자 이메일로 팝빌이 발송한다. */
export async function issueStatementPopbill(id: string): Promise<Result> {
  const u = await requireAppUser();
  const { isCeoUser } = await import("@/lib/ceo");
  if (!isCeoUser(u)) return { ok: false, message: "전자 발행은 대표 계정만 할 수 있습니다." };
  const { getPopbillConfig, registIssueStatement, describePopbillError } = await import("@/lib/popbill");
  const { digits } = await import("@/lib/popbillInvoice");
  const cfg = await getPopbillConfig();
  if (!cfg) return { ok: false, message: "팝빌 키가 없습니다. 설정에서 저장하세요." };
  const supabase = createSupabaseServerClient();
  const { data: st } = await supabase.from("trade_statements").select("*").eq("id", id).maybeSingle();
  const s = st as any;
  if (!s) return { ok: false, message: "명세서를 찾지 못했습니다." };
  if (s.status === "발급") return { ok: false, message: "이미 발급한 명세서입니다." };
  const corpName = s.supplier === "뷰티밤" ? "뷰티밤㈜" : "㈜운호컴퍼니";
  const { data: corp } = await supabase.from("corporations").select("name, business_no, ceo, address, biz_type, biz_item, tax_contact, tax_email").eq("name", corpName).maybeSingle();
  const c = (corp ?? {}) as any;
  const missing = [digits(c.business_no).length !== 10 && "공급자 사업자번호", !c.biz_type && "공급자 업태", !c.biz_item && "공급자 종목", digits(s.receiver_biz_no).length !== 10 && "공급받는자 사업자번호"].filter(Boolean);
  if (missing.length) return { ok: false, message: `발행 전에 채워야 할 항목: ${missing.join(", ")} (공급자 정보는 설정 → 팝빌에서 입력)` };
  const mgtKey = (cfg.isTest ? "TS-T-" : "TS-") + String(s.doc_no).replace(/^TS-/, "").replace(/[^0-9-]/g, "");
  const writeDate = String(s.issue_date).replace(/-/g, "");
  const statement = {
    itemCode: 121, mgtKey, writeDate, purposeType: "청구", taxType: s.tax_type, formCode: "",
    senderCorpNum: digits(c.business_no), senderCorpName: c.name, senderCEOName: c.ceo, senderAddr: c.address, senderBizType: c.biz_type, senderBizClass: c.biz_item,
    senderContactName: c.tax_contact || c.ceo, senderEmail: c.tax_email || "",
    receiverCorpNum: digits(s.receiver_biz_no), receiverCorpName: s.receiver_name, receiverCEOName: s.receiver_ceo || "", receiverAddr: s.receiver_address || "",
    receiverContactName: s.receiver_ceo || s.receiver_name, receiverEmail: s.receiver_email || "",
    supplyCostTotal: String(s.supply_total), taxTotal: String(s.tax_total), totalAmount: String(s.total), remark1: (s.note || "").slice(0, 150),
    detailList: (s.items as any[]).map((it, i) => ({
      serialNum: i + 1, purchaseDT: writeDate, itemName: it.name, spec: it.spec || "",
      qty: it.qty != null ? String(it.qty) : "", unitCost: it.unit_price != null ? String(it.unit_price) : "", supplyCost: String(it.supply), tax: String(it.tax),
    })),
  };
  try {
    await registIssueStatement(cfg, digits(c.business_no), statement, `운영플랫폼 ${s.doc_no}`);
    if (!cfg.isTest) await supabase.from("trade_statements").update({ status: "발급", issued_at: new Date().toISOString(), popbill_mgt_key: mgtKey }).eq("id", id);
    revalidatePath("/statements");
    return { ok: true, message: cfg.isTest ? "테스트 발행 성공(test.popbill.com). 상태는 바꾸지 않았습니다." : `전자 거래명세서를 발급했습니다${s.receiver_email ? ` · ${s.receiver_email}로 발송` : ""}.` };
  } catch (e) {
    return { ok: false, message: describePopbillError(e as { code?: number; message?: string }) };
  }
}
