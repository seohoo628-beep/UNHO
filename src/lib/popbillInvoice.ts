// 팝빌 전자세금계산서 요청 데이터 구성(순수 함수, 서버·테스트 공용).
// 미수금 1건 = 세금계산서 1장(품목 1개). 실제 API 호출은 src/lib/popbill.ts.
import { supplyOf, vatOf } from "@/lib/taxInvoice";

export type Party = {
  corpNum: string | null; // 사업자번호(하이픈 허용)
  corpName: string | null;
  ceo: string | null;
  address: string | null;
  bizType: string | null;
  bizItem: string | null;
  contact?: string | null;
  email: string | null;
};

export type IssueSource = {
  id: string;
  item: string | null;
  supplyDate: string | null; // YYYY-MM-DD
  quantity: number | null;
  unitPrice: number | null;
  supplyAmount: number | null;
  taxType: string | null; // 과세·영세·면세
  invoiceKind: string | null; // 청구·영수
  note: string | null;
};

export const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** 팝빌 문서 관리번호: 영문·숫자·'-' 24자 이내, 회원사 안에서 유일. 미수금 id 기반이라 같은 건을 두 번 발행하지 못한다. */
export function mgtKeyOf(receivableId: string, isTest: boolean): string {
  const base = receivableId.replace(/[^0-9a-f]/gi, "").slice(0, 20);
  return (isTest ? "T-" : "R-") + base;
}

export type BuildResult = { ok: true; invoice: Record<string, unknown>; total: number } | { ok: false; missing: string[] };

export function buildTaxinvoice(src: IssueSource, seller: Party, buyer: Party, mgtKey: string, today: string): BuildResult {
  const missing: string[] = [];
  const need = (v: string | null | undefined, label: string) => { if (!v || !String(v).trim()) missing.push(label); };
  if (digits(seller.corpNum).length !== 10) missing.push("공급자 사업자번호");
  need(seller.corpName, "공급자 상호");
  need(seller.ceo, "공급자 대표자");
  need(seller.address, "공급자 주소");
  need(seller.bizType, "공급자 업태");
  need(seller.bizItem, "공급자 종목");
  if (digits(buyer.corpNum).length !== 10) missing.push("매출처 사업자번호");
  need(buyer.corpName, "매출처 상호");
  need(buyer.ceo, "매출처 대표자");
  need(src.item, "품목");
  const supply = supplyOf({ supplyAmount: src.supplyAmount, quantity: src.quantity, unitPrice: src.unitPrice });
  if (supply == null) missing.push("공급가액(또는 수량·단가)");
  const writeDate = digits(src.supplyDate || today);
  if (writeDate.length !== 8) missing.push("공급일");
  if (missing.length) return { ok: false, missing };

  const taxType = src.taxType === "영세" || src.taxType === "면세" ? src.taxType : "과세";
  const tax = vatOf(supply!, taxType);
  const s = (n: number) => String(Math.round(n));
  const invoice: Record<string, unknown> = {
    writeDate,
    chargeDirection: "정과금",
    issueType: "정발행",
    purposeType: src.invoiceKind === "영수" ? "영수" : "청구",
    taxType,
    invoicerCorpNum: digits(seller.corpNum),
    invoicerMgtKey: mgtKey,
    invoicerCorpName: seller.corpName,
    invoicerCEOName: seller.ceo,
    invoicerAddr: seller.address,
    invoicerBizType: seller.bizType,
    invoicerBizClass: seller.bizItem,
    invoicerContactName: seller.contact || seller.ceo,
    invoicerEmail: seller.email || "",
    invoiceeType: "사업자",
    invoiceeCorpNum: digits(buyer.corpNum),
    invoiceeCorpName: buyer.corpName,
    invoiceeCEOName: buyer.ceo,
    invoiceeAddr: buyer.address || "",
    invoiceeBizType: buyer.bizType || "",
    invoiceeBizClass: buyer.bizItem || "",
    invoiceeEmail1: buyer.email || "",
    supplyCostTotal: s(supply!),
    taxTotal: s(tax),
    totalAmount: s(supply! + tax),
    remark1: (src.note || "").slice(0, 150),
    detailList: [
      {
        serialNum: 1,
        purchaseDT: writeDate,
        itemName: (src.item || "").slice(0, 100),
        qty: src.quantity != null ? String(src.quantity) : "",
        unitCost: src.unitPrice != null ? s(src.unitPrice) : "",
        supplyCost: s(supply!),
        tax: s(tax),
      },
    ],
  };
  return { ok: true, invoice, total: supply! + tax };
}

/** 품목 여러 줄(최대 99) 세금계산서. 직접 입력 발행용. */
export type InvoiceLine = { name: string; spec?: string; qty: number | null; unit_price: number | null; supply: number; tax: number };

export function buildTaxinvoiceLines(
  args: { writeDate: string; taxType: string; purpose: string; note: string | null; items: InvoiceLine[] },
  seller: Party, buyer: Party, mgtKey: string
): BuildResult {
  const missing: string[] = [];
  const need = (v: string | null | undefined, label: string) => { if (!v || !String(v).trim()) missing.push(label); };
  if (digits(seller.corpNum).length !== 10) missing.push("공급자 사업자번호");
  need(seller.corpName, "공급자 상호"); need(seller.ceo, "공급자 대표자"); need(seller.address, "공급자 주소");
  need(seller.bizType, "공급자 업태"); need(seller.bizItem, "공급자 종목");
  if (digits(buyer.corpNum).length !== 10) missing.push("공급받는자 사업자번호");
  need(buyer.corpName, "공급받는자 상호"); need(buyer.ceo, "공급받는자 대표자");
  const items = args.items.filter((i) => i.name && i.supply > 0).slice(0, 99);
  if (items.length === 0) missing.push("품목(공급가 있는 줄)");
  const writeDate = digits(args.writeDate);
  if (writeDate.length !== 8) missing.push("작성일");
  if (missing.length) return { ok: false, missing };
  const supply = items.reduce((s, i) => s + i.supply, 0);
  const tax = items.reduce((s, i) => s + i.tax, 0);
  const s = (n: number) => String(Math.round(n));
  const invoice: Record<string, unknown> = {
    writeDate, chargeDirection: "정과금", issueType: "정발행",
    purposeType: args.purpose === "영수" ? "영수" : "청구",
    taxType: args.taxType === "영세" || args.taxType === "면세" ? args.taxType : "과세",
    invoicerCorpNum: digits(seller.corpNum), invoicerMgtKey: mgtKey, invoicerCorpName: seller.corpName, invoicerCEOName: seller.ceo,
    invoicerAddr: seller.address, invoicerBizType: seller.bizType, invoicerBizClass: seller.bizItem,
    invoicerContactName: seller.contact || seller.ceo, invoicerEmail: seller.email || "",
    invoiceeType: "사업자", invoiceeCorpNum: digits(buyer.corpNum), invoiceeCorpName: buyer.corpName, invoiceeCEOName: buyer.ceo,
    invoiceeAddr: buyer.address || "", invoiceeBizType: buyer.bizType || "", invoiceeBizClass: buyer.bizItem || "", invoiceeEmail1: buyer.email || "",
    supplyCostTotal: s(supply), taxTotal: s(tax), totalAmount: s(supply + tax), remark1: (args.note || "").slice(0, 150),
    detailList: items.map((it, i) => ({
      serialNum: i + 1, purchaseDT: writeDate, itemName: it.name.slice(0, 100), spec: (it.spec || "").slice(0, 60),
      qty: it.qty != null ? String(it.qty) : "", unitCost: it.unit_price != null ? s(it.unit_price) : "", supplyCost: s(it.supply), tax: s(it.tax),
    })),
  };
  return { ok: true, invoice, total: supply + tax };
}
