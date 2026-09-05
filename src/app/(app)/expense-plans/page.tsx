import { requireAppUser } from "@/lib/auth";
import { seoulToday } from "@/lib/time";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewFinance } from "@/lib/finance";
import ExpensePlansClient, { type ExpensePlan } from "./ExpensePlansClient";

export const dynamic = "force-dynamic";

const COLS = "id,month,kind,category,name,planned,actual,due_day,brand,memo,sort_order";

function mapRow(r: any): ExpensePlan {
  return {
    id: r.id,
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

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function Page({ searchParams }: { searchParams?: { m?: string } }) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  // 지출계획표는 재무 열람 권한(CEO + can_finance 계정)만.
  if (!canViewFinance(user)) redirect("/hub");

  const today = seoulToday();
  const month = MONTH_RE.test(searchParams?.m ?? "") ? (searchParams!.m as string) : today.slice(0, 7);
  const prevMonth = shiftMonth(month, -1);

  let rows: ExpensePlan[] = [];
  let months: string[] = [];
  let dbReady = true;
  try {
    const supabase = createSupabaseServerClient();
    const cur = await supabase
      .from("expense_plans")
      .select(COLS)
      .eq("month", month)
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (cur.error) {
      dbReady = false;
    } else {
      rows = (cur.data ?? []).map(mapRow);
      const ms = await supabase.from("expense_plans").select("month").order("month", { ascending: false }).limit(500);
      months = Array.from(new Set((ms.data ?? []).map((r: any) => String(r.month)).filter((m) => MONTH_RE.test(m))));
    }
  } catch {
    dbReady = false;
  }

  return (
    <ExpensePlansClient
      month={month}
      prevMonth={prevMonth}
      nextMonth={shiftMonth(month, 1)}
      thisMonth={today.slice(0, 7)}
      months={months}
      initial={rows}
      dbReady={dbReady}
    />
  );
}
