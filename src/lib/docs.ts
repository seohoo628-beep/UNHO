// 계약서·거래명세서·계산서 공용 계산(순수 함수, 테스트 대상).
import { vatOf } from "@/lib/taxInvoice";
import { addDays } from "@/lib/agentRoutines";

export type StatementItem = { name: string; spec?: string; qty: number | null; unit_price: number | null; supply: number; tax: number };

/** 품목 줄 정리: 공급가 = 직접 입력 또는 수량×단가, 세액 = 과세 10% 절사. 이름 없는 줄은 버린다. */
export function normalizeItems(
  raw: { name?: string; spec?: string; qty?: number | string | null; unit_price?: number | string | null; supply?: number | string | null }[],
  taxType: string
): StatementItem[] {
  const n = (v: unknown) => {
    const x = Number(String(v ?? "").replace(/[^\d.\-]/g, ""));
    return Number.isFinite(x) && String(v ?? "").trim() !== "" ? x : null;
  };
  return raw
    .filter((r) => (r.name ?? "").trim())
    .map((r) => {
      const qty = n(r.qty);
      const unit = n(r.unit_price);
      const direct = n(r.supply);
      const supply = Math.round(direct != null && direct > 0 ? direct : qty != null && unit != null ? qty * unit : 0);
      return { name: r.name!.trim().slice(0, 100), spec: (r.spec ?? "").trim().slice(0, 60), qty, unit_price: unit != null ? Math.round(unit) : null, supply, tax: vatOf(supply, taxType) };
    });
}

export function totalsOf(items: StatementItem[]) {
  const supply = items.reduce((s, i) => s + i.supply, 0);
  const tax = items.reduce((s, i) => s + i.tax, 0);
  return { supply, tax, total: supply + tax };
}

/** 거래명세서 문서번호: TS-YYYYMMDD-NNN (그날 이미 쓴 번호 다음) */
export function nextDocNo(date: string, existing: string[]): string {
  const prefix = `TS-${date.replace(/-/g, "")}-`;
  const max = existing.filter((d) => d.startsWith(prefix)).reduce((m, d) => Math.max(m, Number(d.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** 세금계산서 발급 기한: 공급일이 속한 달의 다음 달 10일 */
export function invoiceDeadline(supplyDate: string): string {
  const [y, m] = supplyDate.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-10`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** 계약 상태 표시: 해지·검토중은 그대로, 체결은 만료일 기준으로 만료/임박/진행 */
export function contractState(c: { status: string; end_date: string | null; notice_days?: number | null; auto_renew?: boolean | null }, today: string): { label: string; tone: "ok" | "warn" | "owner" | ""; days: number | null } {
  if (c.status === "해지") return { label: "해지", tone: "", days: null };
  if (c.status === "검토중") return { label: "검토중", tone: "warn", days: null };
  if (!c.end_date) return { label: "체결 · 기한 없음", tone: "ok", days: null };
  const d = daysBetween(today, c.end_date);
  if (d < 0) return { label: c.auto_renew ? `자동갱신 확인 필요 (${-d}일 지남)` : `만료 (${-d}일 지남)`, tone: "owner", days: d };
  if (d <= (c.notice_days ?? 30)) return { label: `만료 D-${d}${c.auto_renew ? " · 자동갱신" : ""}`, tone: "warn", days: d };
  return { label: `진행 · D-${d}`, tone: "ok", days: d };
}

export { addDays };
