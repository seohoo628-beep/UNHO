// 가계부 반복 지출 규칙을 해당 월의 실제 기록(ledger_entries)으로 만들어 넣는다.
// 페이지 진입(해당 월 조회)과 매일 크론에서 호출 — (recurring_id, recurring_month) 유니크라 여러 번 호출해도 안전.

type Client = {
  from: (table: string) => any;
};

export type RecurringRow = {
  id: string;
  scope: string;
  type: string;
  category: string | null;
  name: string;
  amount: number;
  method: string | null;
  brand: string | null;
  memo: string | null;
  day_of_month: number;
  start_month: string;
  end_month: string | null;
  active: boolean;
  skipped_months: unknown;
  created_by: string | null;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function entryDateFor(month: string, day: number): string {
  const d = Math.min(Math.max(1, Math.round(Number(day) || 1)), daysInMonth(month));
  return `${month}-${String(d).padStart(2, "0")}`;
}

export const isMissingRecurring = (err: { code?: string; message?: string } | null | undefined) =>
  !!err && (err.code === "42P01" || err.code === "42703" || /ledger_recurrings|recurring_id|recurring_month/.test(err.message ?? ""));

/**
 * @param month 'YYYY-MM'
 * @param userId 지정 시 개인 규칙은 본인 것만(회사 규칙은 전부). 미지정(크론)이면 전부.
 * @returns 생성 건수. 테이블 미적용이면 null.
 */
export async function materializeRecurring(client: Client, month: string, userId?: string): Promise<number | null> {
  if (!MONTH_RE.test(month)) return 0;
  const { data: rules, error } = await client
    .from("ledger_recurrings")
    .select("id,scope,type,category,name,amount,method,brand,memo,day_of_month,start_month,end_month,active,skipped_months,created_by")
    .eq("active", true)
    .lte("start_month", month);
  if (error) return isMissingRecurring(error) ? null : 0;
  const list = ((rules ?? []) as RecurringRow[]).filter((r) => {
    if (r.end_month && r.end_month < month) return false;
    if (userId && r.scope === "개인" && r.created_by !== userId) return false;
    const skipped = Array.isArray(r.skipped_months) ? (r.skipped_months as unknown[]) : [];
    return !skipped.includes(month);
  });
  if (list.length === 0) return 0;

  const { data: existing, error: e2 } = await client
    .from("ledger_entries")
    .select("recurring_id")
    .eq("recurring_month", month)
    .in("recurring_id", list.map((r) => r.id));
  if (e2) return isMissingRecurring(e2) ? null : 0;
  const have = new Set(((existing ?? []) as { recurring_id: string }[]).map((x) => x.recurring_id));

  const rows = list
    .filter((r) => !have.has(r.id))
    .map((r) => ({
      scope: r.scope === "개인" ? "개인" : "회사",
      entry_date: entryDateFor(month, r.day_of_month),
      type: r.type === "수입" ? "수입" : "지출",
      category: r.category,
      name: r.name,
      amount: Number(r.amount) || 0,
      method: r.method,
      brand: r.brand,
      memo: r.memo,
      photos: [],
      recurring_id: r.id,
      recurring_month: month,
      created_by: r.created_by,
    }));
  if (rows.length === 0) return 0;

  let ins = await client.from("ledger_entries").upsert(rows, { onConflict: "recurring_id,recurring_month", ignoreDuplicates: true });
  if (ins.error && /photos/.test(ins.error.message ?? "")) {
    // 0095(photos) 미적용 환경
    ins = await client.from("ledger_entries").upsert(rows.map(({ photos: _p, ...rest }) => rest), { onConflict: "recurring_id,recurring_month", ignoreDuplicates: true });
  }
  if (ins.error) return isMissingRecurring(ins.error) ? null : 0;
  return rows.length;
}
