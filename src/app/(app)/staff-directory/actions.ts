"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

export interface EmpInput {
  name: string;
  position: string;
  hireDate: string;
  salary: number;
  phone: string;
  note: string;
}

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

function row(inp: EmpInput) {
  return {
    name: inp.name.trim(),
    position: inp.position?.trim() || null,
    hire_date: inp.hireDate || null,
    salary: Number(inp.salary) || 0,
    phone: inp.phone?.trim() || null,
    note: inp.note?.trim() || null,
  };
}

export async function createEmp(inp: EmpInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  if (!inp.name?.trim()) return { ok: false, error: "이름을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("staff_directory").insert(row(inp));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/staff-directory");
  return { ok: true };
}

export async function updateEmp(id: string, inp: EmpInput): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("staff_directory")
    .update({ ...row(inp), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/staff-directory");
  return { ok: true };
}

export async function deleteEmp(id: string): Promise<Result> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("staff_directory").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/staff-directory");
  return { ok: true };
}
