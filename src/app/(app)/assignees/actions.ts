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
  revalidatePath("/staff-directory");
  return { ok: true, id: (data as { id: string } | null)?.id, name: nm };
}
