"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

export interface PayableInput {
  counterparty: string;
  item: string;
  amount: number;
  paid: number;
  billDate: string;
  dueDate: string;
  note: string;
  // 정기 지급
  principal: number;
  interest: number;
  component: string; // 원금 / 이자 / 원금+이자
  frequency: string; // 없음 / 매일 / 매주 / 매월
  periodAmount: number;
  hasEnd: boolean;
  endDate: string;
}

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

function row(inp: PayableInput) {
  return {
    counterparty: inp.counterparty.trim(),
    item: inp.item?.trim() || null,
    amount: Number(inp.amount) || 0,
    paid: Number(inp.paid) || 0,
    bill_date: inp.billDate || null,
    due_date: inp.dueDate || null,
    note: inp.note?.trim() || null,
    principal: Number(inp.principal) || 0,
    interest: Number(inp.interest) || 0,
    component: inp.component || null,
    frequency: inp.frequency || "없음",
    period_amount: Number(inp.periodAmount) || 0,
    has_end: !!inp.hasEnd,
    end_date: inp.hasEnd ? inp.endDate || null : null,
  };
}

export async function createPayable(inp: PayableInput): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!inp.counterparty?.trim()) return { ok: false, error: "거래처를 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("payables").insert({ ...row(inp), created_by: u.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payables");
  return { ok: true };
}

export async function updatePayable(id: string, inp: PayableInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("payables")
    .update({ ...row(inp), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payables");
  return { ok: true };
}

export async function deletePayable(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("payables").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payables");
  return { ok: true };
}

// 지급완료 처리(완료 시각 기록 + 지급액을 예정액으로 채움) / 되돌리기
export async function settlePayable(id: string, done: boolean): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  let patch: Record<string, unknown> = { settled_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
  if (done) {
    // 완료 시 잔액을 0으로(지급액 = 예정액). 예정액 정보가 필요해 먼저 읽는다.
    const { data } = await supabase.from("payables").select("amount").eq("id", id).maybeSingle();
    const amount = Number((data as { amount?: number } | null)?.amount) || 0;
    patch = { ...patch, paid: amount };
  }
  let { error } = await supabase.from("payables").update(patch).eq("id", id);
  if (error && /settled_at/.test(error.message)) {
    return { ok: false, error: "완료 기능을 쓰려면 DB에 settled_at 컬럼을 추가해야 합니다(화면 안내 SQL 실행)." };
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/payables");
  return { ok: true };
}
