"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

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
  // 대표가 직접 등록하면 즉시 승인, 직원이 신청하면 승인 대기(pending).
  const isOwner = user.role === "owner";
  const base: Record<string, unknown> = {
    member_id: memberId,
    use_date: useDate,
    type,
    approver: isOwner ? str(fd, "approver") ?? "대표" : null,
    note: str(fd, "note"),
    created_by: user.id,
  };
  // status 컬럼이 있으면 함께 저장, 없으면(마이그레이션 전) 제외하고 저장.
  let { error } = await supabase.from("leave_usages").insert({
    ...base,
    status: isOwner ? "approved" : "pending",
    requested_by: user.id,
  });
  if (error && /(status|requested_by)/.test(error.message)) {
    ({ error } = await supabase.from("leave_usages").insert(base));
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}

// 연차 신청 승인/반려 — 대표만.
export async function decideUsage(id: string, decision: "approved" | "rejected"): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "승인·반려는 대표만 할 수 있습니다." };
  const supabase = createSupabaseServerClient();
  const patch: Record<string, unknown> = {
    status: decision,
    approver: decision === "approved" ? user.name || "대표" : null,
    decided_by: user.id,
    decided_at: new Date().toISOString(),
  };
  let { error } = await supabase.from("leave_usages").update(patch).eq("id", id);
  if (error && /(status|decided_by|decided_at)/.test(error.message)) {
    return { ok: false, error: "승인 기능을 쓰려면 DB에 status 컬럼을 추가해야 합니다(화면 안내 SQL 실행)." };
  }
  if (error) return { ok: false, error: error.message };
  await logAudit({ actorId: user.id, actorName: user.name, action: decision, entity: "leave", label: "연차 신청" });
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
