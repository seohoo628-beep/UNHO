// 대표 통합 상황판: 돈·재고·업무·AI·고객을 한 번에 모은다.
// 각 항목은 실패해도 null로 두고 화면에서 "데이터 없음"으로 보인다(한 곳 오류가 전체를 막지 않게).
import { addDays } from "@/lib/agentRoutines";

type Client = { from: (t: string) => any };

export type Situation = {
  today: string;
  pnl: null | { date: string; revenue: number; opProfit: number; margin: number | null; roas: number | null; rev7: number; rev7Prev: number };
  cash: null | { recvOpen: number; recvOverdue: number; recvOverdueN: number; recv7: number; pay7: number; payOverdue: number };
  stock: null | { risky: { item: string; days: number; need: number }[]; total: number };
  expiry: null | { soon: number }; // 무당티 유통기한 90일 이내 로트
  approvals: number | null;
  todos: null | { overdue: number; dueToday: number };
  ai: null | { review: number; failed: number; report: string | null; reportAt: string | null };
  cs: null | { open: number; delayed: number };
};

const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

/** 재고 일수 = 현재고 ÷ 일평균 출고. 리드타임+안전여유보다 짧으면 위험. */
export function stockRisk(items: { item: string; current_stock: unknown; out_30d: unknown; safety_days: unknown; lead_time_days: unknown }[]) {
  const risky = items
    .map((r) => {
      const daily = num(r.out_30d) / 30;
      const days = daily > 0 ? Math.floor(num(r.current_stock) / daily) : Infinity;
      const need = num(r.lead_time_days) + (num(r.safety_days) || 7);
      return { item: r.item, days, need };
    })
    .filter((r) => r.days !== Infinity && r.days < r.need)
    .sort((a, b) => a.days - b.days);
  return { risky: risky.slice(0, 5), total: risky.length };
}

/** 대표 일일 보고 본문에서 '결론' 부분만 */
export function reportHeadline(note: string | null): string | null {
  if (!note) return null;
  const body = note.replace(/^\[AI 정기업무 결과[^\n]*\n[^\n]*\n\n/, "").split("\n\n[업무 지시]")[0];
  const m = body.match(/결론[^\n]*\n([\s\S]*?)(?:\n\s*(?:#+\s*)?\**\s*2[.)]|$)/);
  return (m ? m[1] : body).trim().split("\n").slice(0, 4).join("\n").slice(0, 400) || null;
}

export async function buildSituation(db: Client, today: string): Promise<Situation> {
  const in7 = addDays(today, 7);
  const [pnl, cash, stock, expiry, approvals, todos, ai, cs] = await Promise.all([
    safe(async () => {
      const { data, error } = await db.from("pnl_snapshots").select("snapshot_date, revenue, op_profit, margin_pct, roas").order("snapshot_date", { ascending: false }).limit(14);
      if (error || !data?.length) return null;
      const rows = data as any[];
      const latest = rows[0];
      return {
        date: latest.snapshot_date,
        revenue: num(latest.revenue),
        opProfit: num(latest.op_profit),
        margin: latest.margin_pct == null ? null : Number(latest.margin_pct),
        roas: latest.roas == null ? null : Number(latest.roas),
        rev7: rows.slice(0, 7).reduce((s, r) => s + num(r.revenue), 0),
        rev7Prev: rows.slice(7, 14).reduce((s, r) => s + num(r.revenue), 0),
      };
    }),
    safe(async () => {
      const [r, p] = await Promise.all([
        db.from("receivables").select("billed, received, due_date").limit(2000),
        db.from("payables").select("amount, paid, due_date").limit(2000),
      ]);
      if (r.error && p.error) return null;
      const recv = ((r.data ?? []) as any[]).map((x) => ({ bal: num(x.billed) - num(x.received), due: x.due_date as string | null })).filter((x) => x.bal > 0);
      const pay = ((p.data ?? []) as any[]).map((x) => ({ bal: num(x.amount) - num(x.paid), due: x.due_date as string | null })).filter((x) => x.bal > 0);
      const overdue = recv.filter((x) => x.due && x.due < today);
      return {
        recvOpen: recv.reduce((s, x) => s + x.bal, 0),
        recvOverdue: overdue.reduce((s, x) => s + x.bal, 0),
        recvOverdueN: overdue.length,
        recv7: recv.filter((x) => x.due && x.due >= today && x.due <= in7).reduce((s, x) => s + x.bal, 0),
        pay7: pay.filter((x) => x.due && x.due >= today && x.due <= in7).reduce((s, x) => s + x.bal, 0),
        payOverdue: pay.filter((x) => x.due && x.due < today).reduce((s, x) => s + x.bal, 0),
      };
    }),
    safe(async () => {
      const { data, error } = await db.from("inventory_items").select("item, current_stock, out_30d, safety_days, lead_time_days").limit(500);
      if (error) return null;
      return stockRisk((data ?? []) as any[]);
    }),
    safe(async () => {
      const { data, error } = await db.from("mdt_lots").select("expiry").lte("expiry", addDays(today, 90)).limit(200);
      if (error) return null;
      return { soon: (data ?? []).length };
    }),
    safe(async () => {
      const { count, error } = await db.from("approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
      return error ? null : count ?? 0;
    }),
    safe(async () => {
      const { data, error } = await db.from("todos").select("due_date").in("status", ["예정", "진행"]).lte("due_date", today).limit(1000);
      if (error) return null;
      const rows = (data ?? []) as { due_date: string }[];
      return { overdue: rows.filter((x) => x.due_date < today).length, dueToday: rows.filter((x) => x.due_date === today).length };
    }),
    safe(async () => {
      const [rv, fl, rp] = await Promise.all([
        db.from("todos").select("id", { count: "exact", head: true }).not("routine_id", "is", null).eq("status", "진행").like("note", "[AI 정기업무 결과%"),
        db.from("todos").select("id", { count: "exact", head: true }).not("routine_id", "is", null).eq("agent_status", "실패").gte("due_date", today),
        db.from("todos").select("note, agent_run_at").not("routine_id", "is", null).like("title", "%대표 일일 보고%").like("note", "[AI 정기업무 결과%").order("agent_run_at", { ascending: false, nullsFirst: false }).limit(1),
      ]);
      if (rv.error) return null;
      const last = ((rp.data ?? []) as { note: string; agent_run_at: string | null }[])[0];
      return { review: rv.count ?? 0, failed: fl.count ?? 0, report: reportHeadline(last?.note ?? null), reportAt: last?.agent_run_at ?? null };
    }),
    safe(async () => {
      const [c, s] = await Promise.all([
        db.from("cs_inquiries").select("id", { count: "exact", head: true }).neq("status", "완료"),
        db.from("shipments").select("id", { count: "exact", head: true }).in("status", ["지연", "반품"]).gte("ship_date", addDays(today, -7)),
      ]);
      if (c.error && s.error) return null;
      return { open: c.count ?? 0, delayed: s.count ?? 0 };
    }),
  ]);
  return { today, pnl, cash, stock, expiry, approvals, todos, ai, cs };
}
