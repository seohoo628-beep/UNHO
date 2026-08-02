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
