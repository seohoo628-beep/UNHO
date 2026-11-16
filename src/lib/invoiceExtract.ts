// 올린 사업자등록증(사진·PDF)에서 읽은 값 → 계산서 공급받는자 / 거래처 값. 순수 함수(테스트 대상).

export type BizRegRaw = {
  name?: string; biz_no?: string; ceo?: string; address?: string; biz_type?: string; biz_item?: string;
  corp_no?: string; open_date?: string; email?: string;
};
export type BuyerFill = { name: string; bizNo: string; ceo: string; address: string; bizType: string; bizItem: string; email: string };

const str = (v: unknown) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());

/** 사업자번호를 000-00-00000 형식으로. 10자리가 아니면 읽은 그대로. */
export function formatBizNo(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : v.trim();
}

/** 업태·종목은 여러 개면 첫 항목을 대표로(계산서 칸 길이 제한), 구분자는 쉼표로 통일 */
const firstOf = (v: unknown) => (v == null ? "" : String(v)).split(/[,/·\n]| {2,}/).map((x) => str(x)).filter(Boolean)[0] ?? "";

export function toBuyerFill(x: BizRegRaw): BuyerFill {
  return {
    name: str(x.name),
    bizNo: formatBizNo(str(x.biz_no)),
    ceo: str(x.ceo),
    address: str(x.address),
    bizType: firstOf(x.biz_type),
    bizItem: firstOf(x.biz_item),
    email: str(x.email),
  };
}

/** 거래처 목록에 같은 사업자번호(없으면 같은 상호)가 있는지 */
export function findVendor<T extends { id: string; name: string; bizNo: string }>(vendors: T[], buyer: { name: string; bizNo: string }): T | null {
  const d = (s: string) => s.replace(/\D/g, "");
  const no = d(buyer.bizNo);
  if (no.length === 10) { const hit = vendors.find((v) => d(v.bizNo) === no); if (hit) return hit; }
  const norm = (s: string) => s.replace(/\s|\(주\)|㈜|주식회사/g, "");
  const nm = norm(buyer.name);
  return nm ? vendors.find((v) => norm(v.name) === nm) ?? null : null;
}
