"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";

// 담당자(=users) 즉석 추가. 로그인 계정이 아닌 '이름표'로만 쓰는 담당자도 등록 가능.
// (auth_id 없이 생성 → 배정 목록에만 노출, 로그인은 불가)
export async function createAssignee(
  name: string
): Promise<{ ok: boolean; id?: string; name?: string; error?: string }> {
  const me = await requireAppUser();
  if (me.role !== "owner" && me.role !== "staff") return { ok: false, error: "권한이 없습니다." };
  const nm = (name || "").trim();
  if (!nm) return { ok: false, error: "이름을 입력하세요." };

  const svc = createSupabaseServiceClient();

  // 이미 같은 이름의 활성 담당자가 있으면 그걸 재사용(중복 방지).
  const { data: existing } = await svc
    .from("users")
    .select("id, name")
    .eq("name", nm)
    .neq("role", "ai")
    .limit(1);
  if (existing && existing.length) {
    return { ok: true, id: (existing[0] as { id: string }).id, name: nm };
  }

  // 유니크 placeholder 이메일(로그인 불가 도메인).
  const email = `assignee.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@unho.local`;
  const { data, error } = await svc
    .from("users")
    .insert({ name: nm, email, role: "staff", active: true })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  // 담당자 목록을 쓰는 화면들 갱신.
  revalidatePath("/todos");
  revalidatePath("/product-dev");
  revalidatePath("/assignees");
  return { ok: true, id: (data as { id: string } | null)?.id, name: nm };
}

// + 버튼으로 추가된 담당자(로그인 없는 이름표) 목록 + 사용량(배정된 업무 수).
export type AddedAssignee = { id: string; name: string; taskCount: number };

export async function listAddedAssignees(): Promise<{ ok: boolean; items?: AddedAssignee[]; error?: string }> {
  const me = await requireAppUser();
  if (me.role !== "owner" && me.role !== "staff") return { ok: false, error: "권한이 없습니다." };
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("users")
    .select("id, name")
    .like("email", "%@unho.local")
    .order("name");
  if (error) return { ok: false, error: error.message };
  const users = (data ?? []) as { id: string; name: string }[];

  // 사용량 집계: 활성 업무의 담당자(단일/다중)에서 각 id 등장 횟수.
  const count = new Map<string, number>();
  try {
    const { data: todos } = await svc
      .from("todos")
      .select("assignee_user_id, assignee_user_ids")
      .limit(2000);
    for (const t of (todos ?? []) as { assignee_user_id: string | null; assignee_user_ids: string[] | null }[]) {
      const ids = new Set<string>();
      if (t.assignee_user_id) ids.add(t.assignee_user_id);
      for (const id of t.assignee_user_ids ?? []) ids.add(id);
      for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
    }
  } catch {
    /* 사용량 집계 실패해도 목록은 반환 */
  }

  const items = users.map((u) => ({ id: u.id, name: u.name, taskCount: count.get(u.id) ?? 0 }));
  return { ok: true, items };
}

export async function renameAssignee(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAppUser();
  if (me.role !== "owner" && me.role !== "staff") return { ok: false, error: "권한이 없습니다." };
  const nm = (name || "").trim();
  if (!nm) return { ok: false, error: "이름을 입력하세요." };
  const svc = createSupabaseServiceClient();
  // 로그인 계정(다른 도메인)은 여기서 못 바꾸도록 @unho.local 만 대상.
  const { error } = await svc.from("users").update({ name: nm }).eq("id", id).like("email", "%@unho.local");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assignees");
  revalidatePath("/todos");
  revalidatePath("/product-dev");
  return { ok: true };
}

export async function deleteAssignee(id: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAppUser();
  if (me.role !== "owner" && me.role !== "staff") return { ok: false, error: "권한이 없습니다." };
  const svc = createSupabaseServiceClient();
  // 안전장치: + 버튼으로 만든 이름표(@unho.local)만 삭제 가능. 실제 로그인 계정은 보호.
  const { error } = await svc.from("users").delete().eq("id", id).like("email", "%@unho.local");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/assignees");
  revalidatePath("/todos");
  revalidatePath("/product-dev");
  return { ok: true };
}
