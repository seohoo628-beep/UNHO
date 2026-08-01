"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

export interface LeaveInput {
  name: string;
  type: string;
  start: string;
  end: string;
  days: number;
  reason: string;
  status: string;
}

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

function row(inp: LeaveInput) {
  return {
    name: inp.name.trim(),
    type: inp.type || "연차",
    start_date: inp.start || null,
    end_date: inp.end || inp.start || null,
    days: Number(inp.days) || 0,
    reason: inp.reason?.trim() || null,
    status: inp.status || "신청",
  };
}

export async function createLeave(inp: LeaveInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  if (!inp.name?.trim()) return { ok: false, error: "직원명을 입력하세요." };
  if (!inp.start) return { ok: false, error: "시작일을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("leave_requests").insert(row(inp));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}

export async function updateLeave(id: string, inp: LeaveInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ ...row(inp), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}

export async function setLeaveStatus(id: string, status: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}

export async function deleteLeave(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("leave_requests").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}
