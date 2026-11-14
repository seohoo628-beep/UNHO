// 매출 세금계산서 발행 준비용 순수 함수.
// 미수금 장부(receivables) + 거래처(vendors) → tax-invoice 스킬의 입력 CSV 행.
// 세액 규칙은 .claude/skills/tax-invoice/scripts/tax_invoice.py 와 같다(과세 10% 원 단위 절사, 영세 0).

export const SUPPLIERS = ["운호컴퍼니", "뷰티밤"] as const;
export const TAX_TYPES = ["과세", "영세", "면세"] as const;
export const INVOICE_KINDS = ["청구", "영수"] as const;

export type Supplier = (typeof SUPPLIERS)[number];
export type TaxType = (typeof TAX_TYPES)[number];
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INPUT_COLUMNS = [
  "공급자", "작성일자", "공급받는자_사업자번호", "공급받는자_상호", "공급받는자_대표자",
  "공급받는자_주소", "공급받는자_업태", "공급받는자_종목", "공급받는자_이메일",
  "품목", "규격", "수량", "단가", "공급가액", "세액", "과세유형", "영수청구", "비고",
] as const;

export type InputRow = Record<(typeof INPUT_COLUMNS)[number], string>;

/** 부가세. 과세 10% 원 단위 절사, 영세·면세 0. */
export function vatOf(supply: number, taxType: TaxType | string = "과세"): number {
  if (taxType !== "과세" || !Number.isFinite(supply) || supply <= 0) return 0;
  return Math.floor(supply / 10);
}

/** 공급가액: 직접 입력값 우선, 없으면 수량×단가. 둘 다 없으면 null. */
export function supplyOf(r: { supplyAmount?: number | null; quantity?: number | null; unitPrice?: number | null }): number | null {
  if (r.supplyAmount != null && r.supplyAmount > 0) return Math.round(r.supplyAmount);
  if (r.quantity != null && r.unitPrice != null && r.quantity > 0 && r.unitPrice > 0) {
    return Math.round(r.quantity * r.unitPrice);
  }
  return null;
}

/** "2026-11" → 그 달 1일과 말일(YYYY-MM-DD). */
export function monthRange(ym: string): { from: string; to: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) throw new Error(`월 형식 오류: ${ym} (YYYY-MM)`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new Error(`월 형식 오류: ${ym} (YYYY-MM)`);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}` };
}

export interface LedgerRow {
  id: string;
  counterparty: string;
  item: string | null;
  supplier: string | null;
  supply_date: string | null;
  quantity: number | null;
  unit_price: number | null;
  supply_amount: number | null;
  tax_type: string | null;
  invoice_kind: string | null;
  invoice_no: string | null;
  note: string | null;
  vendors: {
    name: string;
    business_no: string | null;
    ceo: string | null;
    address: string | null;
    biz_type: string | null;
    biz_item: string | null;
    tax_email: string | null;
    email: string | null;
  } | null;
}

export interface ExportResult {
  rows: InputRow[];
  /** 면세: 세금계산서가 아니라 (면세)계산서 대상이라 따로 보고 */
  exempt: LedgerRow[];
  /** 장부에서 빠진 정보 때문에 CSV에 빈칸이 생긴 건 */
  gaps: { id: string; counterparty: string; missing: string[] }[];
}

/** 발행 대상(승인번호 없는 건) → 입력 CSV 행. 기간·공급자 필터는 호출 쪽 쿼리에서 한다. */
export function toInputRows(ledger: LedgerRow[]): ExportResult {
  const rows: InputRow[] = [];
  const exempt: LedgerRow[] = [];
  const gaps: ExportResult["gaps"] = [];
  for (const r of ledger) {
    if (r.invoice_no) continue;
    if (r.tax_type === "면세") {
      exempt.push(r);
      continue;
    }
    const v = r.vendors;
    const supply = supplyOf({ supplyAmount: r.supply_amount, quantity: r.quantity, unitPrice: r.unit_price });
    const taxType = r.tax_type || "과세";
    const missing: string[] = [];
    if (!r.supplier) missing.push("공급자 법인");
    if (!r.supply_date) missing.push("공급일");
    if (!v) missing.push("매출처 연결");
    else {
      if (!v.business_no) missing.push("사업자번호");
      if (!v.ceo) missing.push("대표자");
      if (!(v.tax_email || v.email)) missing.push("세금계산서 이메일");
      if (!v.biz_type || !v.biz_item) missing.push("업태·종목");
    }
    if (!r.item) missing.push("품목");
    if (supply == null) missing.push("공급가액");
    if (missing.length) gaps.push({ id: r.id, counterparty: r.counterparty, missing });

    rows.push({
      공급자: r.supplier ?? "",
      작성일자: r.supply_date ?? "",
      공급받는자_사업자번호: v?.business_no ?? "",
      공급받는자_상호: v?.name ?? r.counterparty,
      공급받는자_대표자: v?.ceo ?? "",
      공급받는자_주소: v?.address ?? "",
      공급받는자_업태: v?.biz_type ?? "",
      공급받는자_종목: v?.biz_item ?? "",
      공급받는자_이메일: v?.tax_email || v?.email || "",
      품목: r.item ?? "",
      규격: "",
      수량: r.quantity != null ? String(r.quantity) : "",
      단가: r.unit_price != null ? String(r.unit_price) : "",
      공급가액: supply != null ? String(supply) : "",
      세액: supply != null ? String(vatOf(supply, taxType)) : "",
      과세유형: taxType,
      영수청구: r.invoice_kind || "청구",
      비고: `receivable:${r.id}`,
    });
  }
  return { rows, exempt, gaps };
}

function csvCell(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 BOM 포함 CSV(엑셀·tax_invoice.py 호환). */
export function toCsv(rows: InputRow[]): string {
  const lines = [INPUT_COLUMNS.join(",")];
  for (const r of rows) lines.push(INPUT_COLUMNS.map((c) => csvCell(r[c] ?? "")).join(","));
  return "﻿" + lines.join("\n") + "\n";
}
