import { requireAppUser } from "@/lib/auth";
import { seoulToday } from "@/lib/time";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCeoUser } from "@/lib/ceo";
import ExpensePlansClient, { type ExpensePlan, type LedgerEntry } from "./ExpensePlansClient";
import type { ExpenseScope } from "./actions";

export const dynamic = "force-dynamic";

const PLAN_COLS = "id,scope,month,kind,category,name,planned,actual,due_day,brand,memo,sort_order";
const LEDGER_COLS = "id,scope,entry_date,type,category,name,amount,method,brand,memo,plan_id,photos";
const LEDGER_COLS_BASIC = "id,scope,entry_date,type,category,name,amount,method,brand,memo,plan_id";

function mapPlan(r: any): ExpensePlan {
  return {
    id: r.id,
    scope: r.scope === "개인" ? "개인" : "회사",
    month: r.month ?? "",
    kind: r.kind === "변동" ? "변동" : "고정",
    category: r.category ?? "",
    name: r.name ?? "",
    planned: Number(r.planned) || 0,
    actual: Number(r.actual) || 0,
    dueDay: r.due_day == null ? null : Number(r.due_day),
    brand: r.brand ?? "",
    memo: r.memo ?? "",
    sortOrder: Number(r.sort_order) || 0,
  };
}

function mapLedger(r: any): LedgerEntry {
  return {
    id: r.id,
    scope: r.scope === "개인" ? "개인" : "회사",
    date: r.entry_date ?? "",
    type: r.type === "수입" ? "수입" : "지출",
    category: r.category ?? "",
    name: r.name ?? "",
    amount: Number(r.amount) || 0,
    method: r.method ?? "",
    brand: r.brand ?? "",
    memo: r.memo ?? "",
    planId: r.plan_id ?? null,
    photos: (Array.isArray(r.photos) ? r.photos : []).filter((u: unknown): u is string => typeof u === "string"),
  };
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function Page({ searchParams }: { searchParams?: { m?: string; s?: string; tab?: string } }) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  // 지출계획표·가계부는 대표 전용.
  if (!isCeoUser(user)) redirect("/hub");

  const today = seoulToday();
  const month = MONTH_RE.test(searchParams?.m ?? "") ? (searchParams!.m as string) : today.slice(0, 7);
  const scope: ExpenseScope = searchParams?.s === "personal" ? "개인" : "회사";
  const tab: "plan" | "ledger" = searchParams?.tab === "ledger" ? "ledger" : "plan";
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  let plans: ExpensePlan[] = [];
  let ledger: LedgerEntry[] = [];
  let months: string[] = [];
  let dbReady = true; // expense_plans 테이블 + scope 컬럼
  let ledgerReady = true; // ledger_entries 테이블
  let photosReady = true; // ledger_entries.photos (0095)
  try {
    const supabase = createSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const own = <T,>(q: T): T => (scope === "개인" ? ((q as any).eq("created_by", user.id) as T) : q);

    const cur = await own(supabase.from("expense_plans").select(PLAN_COLS).eq("scope", scope).eq("month", month))
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (cur.error) {
      dbReady = false;
    } else {
      plans = (cur.data ?? []).map(mapPlan);
      const ms = await own(supabase.from("expense_plans").select("month").eq("scope", scope)).order("month", { ascending: false }).limit(500);
      const set = new Set<string>((ms.data ?? []).map((r: any) => String(r.month)).filter((m: string) => MONTH_RE.test(m)));
      const fetchLedger = (cols: string) =>
        own(supabase.from("ledger_entries").select(cols).eq("scope", scope).gte("entry_date", `${month}-01`).lt("entry_date", `${nextMonth}-01`))
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false });
      let lg: { data: any[] | null; error: { message?: string } | null } = await fetchLedger(LEDGER_COLS);
      if (lg.error && /photos/.test(lg.error.message ?? "")) {
        photosReady = false;
        lg = await fetchLedger(LEDGER_COLS_BASIC); // 0095 전
      }
      if (lg.error) ledgerReady = false;
      else {
        ledger = (lg.data ?? []).map(mapLedger);
        const lm = await own(supabase.from("ledger_entries").select("entry_date").eq("scope", scope)).order("entry_date", { ascending: false }).limit(2000);
        for (const r of lm.data ?? []) {
          const m = String((r as any).entry_date ?? "").slice(0, 7);
          if (MONTH_RE.test(m)) set.add(m);
        }
      }
      months = Array.from(set).sort().reverse();
    }
  } catch {
    dbReady = false;
  }

  return (
    <ExpensePlansClient
      key={`${scope}-${month}-${tab}`}
      scope={scope}
      tab={tab}
      month={month}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
      thisMonth={today.slice(0, 7)}
      today={today}
      months={months}
      initialPlans={plans}
      initialLedger={ledger}
      dbReady={dbReady}
      ledgerReady={ledgerReady}
      photosReady={photosReady}
    />
  );
}
