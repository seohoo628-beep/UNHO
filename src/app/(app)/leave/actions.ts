"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";

type Result = { ok: boolean; error?: string };

async function requireStaff() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") return null;
  return user;
}

const str = (fd: FormData, k: string) => {
  const v = (fd.get(k) as string)?.trim();
  return v ? v : null;
};

export async function addMember(fd: FormData): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const name = str(fd, "name");
  const join = str(fd, "join_date");
  if (!name || !join) return { ok: false, error: "성명·입사일을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("leave_members").insert({
    name,
    join_date: join,
    carryover: Number(str(fd, "carryover") ?? "0") || 0,
    note: str(fd, "note"),
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}

export async function updateMember(id: string, fd: FormData): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const name = str(fd, "name");
  const join = str(fd, "join_date");
  if (!name || !join) return { ok: false, error: "성명·입사일을 입력하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("leave_members")
    .update({
      name,
      join_date: join,
      carryover: Number(str(fd, "carryover") ?? "0") || 0,
      note: str(fd, "note"),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}

export async function deleteMember(id: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("leave_members").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}

export async function addUsage(fd: FormData): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const memberId = str(fd, "member_id");
  const useDate = str(fd, "use_date");
  const type = str(fd, "type") ?? "연차";
  if (!memberId || !useDate) return { ok: false, error: "대상자·사용일자를 선택하세요." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("leave_usages").insert({
    member_id: memberId,
    use_date: useDate,
    type,
    approver: str(fd, "approver") ?? "대표",
    note: str(fd, "note"),
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}

export async function deleteUsage(id: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("leave_usages").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}
