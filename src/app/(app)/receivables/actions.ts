"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

export interface ReceivableInput {
  counterparty: string;
  item: string;
  billed: number;
  received: number;
  billDate: string;
  dueDate: string;
  note: string;
}

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

function row(inp: ReceivableInput) {
  return {
    counterparty: inp.counterparty.trim(),
    item: inp.item?.trim() || null,
    billed: Number(inp.billed) || 0,
    received: Number(inp.received) || 0,
    bill_date: inp.billDate || null,
    due_date: inp.dueDate || null,
    note: inp.note?.trim() || null,
  };
}

export async function createReceivable(inp: ReceivableInput): Promise<Result> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  if (!inp.counterparty?.trim()) return { ok: false, error: "거래처를 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("receivables").insert({ ...row(inp), created_by: u.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receivables");
  return { ok: true };
}

export async function updateReceivable(id: string, inp: ReceivableInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("receivables")
    .update({ ...row(inp), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receivables");
  return { ok: true };
}

export async function deleteReceivable(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("receivables").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receivables");
  return { ok: true };
}

// 부분 수금 기재: 입금액을 amount(원)만큼 누적한다. 청구액을 다 채우면 자동 완료(가능 시).
export async function addReceipt(id: string, amount: number): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const add = Math.max(0, Math.round(Number(amount) || 0));
  if (add <= 0) return { ok: false, error: "수금 금액을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("receivables").select("billed,received").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "항목을 찾을 수 없습니다." };
  const billed = Number((data as any).billed) || 0;
  const received = (Number((data as any).received) || 0) + add;
  const patch: Record<string, unknown> = { received, updated_at: new Date().toISOString() };
  if (billed > 0 && received >= billed) patch.settled_at = new Date().toISOString();
  let { error } = await supabase.from("receivables").update(patch).eq("id", id);
  if (error && /settled_at/.test(error.message)) {
    delete (patch as any).settled_at;
    ({ error } = await supabase.from("receivables").update(patch).eq("id", id));
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receivables");
  return { ok: true };
}

// 수금완료 처리(완료 시각 기록 + 입금액을 청구액으로 채움) / 되돌리기
export async function settleReceivable(id: string, done: boolean): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  let patch: Record<string, unknown> = { settled_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
  if (done) {
    const { data } = await supabase.from("receivables").select("billed").eq("id", id).maybeSingle();
    const billed = Number((data as { billed?: number } | null)?.billed) || 0;
    patch = { ...patch, received: billed };
  }
  const { error } = await supabase.from("receivables").update(patch).eq("id", id);
  if (error && /settled_at/.test(error.message)) {
    return { ok: false, error: "완료 기능을 쓰려면 DB에 settled_at 컬럼을 추가해야 합니다(화면 안내 SQL 실행)." };
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/receivables");
  return { ok: true };
}
