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

// 예정일(ISO YYYY-MM-DD)을 주기만큼 다음으로 넘긴다.
function advanceDate(iso: string, freq: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  if (freq === "매일") dt.setUTCDate(dt.getUTCDate() + 1);
  else if (freq === "매주") dt.setUTCDate(dt.getUTCDate() + 7);
  else if (freq === "매월") dt.setUTCMonth(dt.getUTCMonth() + 1);
  else dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

// 정기 납입 1회 처리: 지급액 누적 + 원금 잔액 차감(원금 포함 시) + 다음 예정일로 이동(연체 방지).
export async function payInstallment(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("payables")
    .select("frequency,period_amount,due_date,paid,principal,interest,component,has_end,end_date")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ok: false, error: "항목을 찾을 수 없습니다." };
  const r = data as {
    frequency: string; period_amount: number; due_date: string | null; paid: number;
    principal: number; interest: number; component: string | null; has_end: boolean; end_date: string | null;
  };
  if (!r.frequency || r.frequency === "없음") return { ok: false, error: "정기 납입 항목이 아닙니다." };

  const inst = Number(r.period_amount) || 0;
  if (inst <= 0) return { ok: false, error: "회차 지급액이 설정되어 있지 않습니다. 수정에서 입력하세요." };

  // 원금 차감분: 원금=전액, 원금+이자=(회차-이자), 이자=0
  const interest = Number(r.interest) || 0;
  let principalPortion = 0;
  if (r.component === "원금") principalPortion = inst;
  else if (r.component === "원금+이자") principalPortion = Math.max(0, inst - interest);
  const newPrincipal = Math.max(0, (Number(r.principal) || 0) - principalPortion);

  // 다음 예정일: 예정일이 미래면 그 날 기준, 지났으면 오늘 기준으로 한 주기 뒤(→ 연체 해소).
  const today = new Date().toISOString().slice(0, 10);
  const base = r.due_date && r.due_date > today ? r.due_date : today;
  const nextDue = advanceDate(base, r.frequency);

  const patch: Record<string, unknown> = {
    paid: (Number(r.paid) || 0) + inst,
    principal: newPrincipal,
    due_date: nextDue,
    updated_at: new Date().toISOString(),
  };
  // 종료일을 넘겼거나 원금이 0이 되면(원금 상환형) 자동 완료 처리.
  const pastEnd = r.has_end && r.end_date && nextDue > r.end_date;
  const principalDone = (r.component === "원금" || r.component === "원금+이자") && newPrincipal <= 0;
  if (pastEnd || principalDone) patch.settled_at = new Date().toISOString();

  let { error } = await supabase.from("payables").update(patch).eq("id", id);
  if (error && /settled_at/.test(error.message)) {
    // settled_at 컬럼이 없으면 그 필드만 빼고 재시도
    delete (patch as any).settled_at;
    ({ error } = await supabase.from("payables").update(patch).eq("id", id));
  }
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
