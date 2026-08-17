"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAppUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

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

// 담당자/직원 목록 + 사용량(배정된 업무 수). login=로그인 계정(실제 직원), 아니면 + 버튼 이름표.
// authLinked=실제로 한 번이라도 로그인해 auth가 연결된 계정.
export type AddedAssignee = { id: string; name: string; taskCount: number; login: boolean; role: string; isSelf: boolean; email: string | null; authLinked: boolean; jobTitle: string | null };

export async function listAddedAssignees(): Promise<{ ok: boolean; items?: AddedAssignee[]; error?: string }> {
  const me = await requireAppUser();
  if (me.role !== "owner" && me.role !== "staff") return { ok: false, error: "권한이 없습니다." };
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("users")
    .select("id, name, email, role, auth_id, job_title")
    .neq("role", "ai")
    .order("name");
  if (error) return { ok: false, error: error.message };
  const users = (data ?? []) as { id: string; name: string; email: string | null; role: string; auth_id: string | null; job_title: string | null }[];

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

  const items = users.map((u) => ({
    id: u.id,
    name: u.name,
    taskCount: count.get(u.id) ?? 0,
    // 로그인 계정 = auth 연결됐거나 이메일이 이름표 도메인(@unho.local)이 아님
    login: !!u.auth_id || !(u.email ?? "").endsWith("@unho.local"),
    role: u.role,
    isSelf: u.id === me.id,
    email: (u.email ?? "").endsWith("@unho.local") ? null : u.email,
    authLinked: !!u.auth_id,
    jobTitle: u.job_title ?? null,
  }));
  // 이름표 먼저, 그다음 로그인 계정
  items.sort((a, b) => Number(a.login) - Number(b.login) || a.name.localeCompare(b.name));
  return { ok: true, items };
}

export async function renameAssignee(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAppUser();
  if (me.role !== "owner" && me.role !== "staff") return { ok: false, error: "권한이 없습니다." };
  const nm = (name || "").trim();
  if (!nm) return { ok: false, error: "이름을 입력하세요." };
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("users").update({ name: nm }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ actorId: me.id, actorName: me.name, action: "updated", entity: "assignee", label: nm, detail: "이름변경" });
  revalidatePath("/assignees");
  revalidatePath("/todos");
  revalidatePath("/product-dev");
  return { ok: true };
}

// auth.users에서 이메일로 id 찾기(소규모 팀 기준 1페이지 조회).
async function findAuthIdByEmail(
  svc: ReturnType<typeof createSupabaseServiceClient>,
  email: string
): Promise<string | null> {
  try {
    const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return data.users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
  } catch {
    return null;
  }
}

// 직원 로그인 계정 생성(대표 전용). 이메일+비밀번호로 본인 로그인 가능해진다.
export async function createStaffAccount(input: {
  name: string;
  email: string;
  password: string;
  role: string;
  jobTitle?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAppUser();
  if (me.role !== "owner") return { ok: false, error: "대표만 계정을 만들 수 있습니다." };
  const name = (input.name || "").trim();
  const email = (input.email || "").trim().toLowerCase();
  const password = input.password || "";
  const jobTitle = (input.jobTitle || "").trim() || null;
  if (!name || !email || !password) return { ok: false, error: "이름·이메일·비밀번호를 모두 입력하세요." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "이메일 형식을 확인하세요." };
  if (password.length < 6) return { ok: false, error: "비밀번호는 6자 이상이어야 합니다." };
  const role = input.role === "owner" ? "owner" : input.role === "guest" ? "guest" : "staff";

  const svc = createSupabaseServiceClient();
  // 1) auth 사용자 생성(이미 있으면 비번 재설정 후 연결)
  let authId: string | null = null;
  const { data: created, error: authErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) {
    const existingId = await findAuthIdByEmail(svc, email);
    if (!existingId) return { ok: false, error: authErr.message };
    await svc.auth.admin.updateUserById(existingId, { password });
    authId = existingId;
  } else {
    authId = created?.user?.id ?? null;
  }

  // 2) users 행 연결(이메일 매칭). 있으면 갱신, 없으면 생성.
  const { data: existing } = await svc.from("users").select("id").eq("email", email).maybeSingle();
  if (existing) {
    await svc.from("users").update({ name, role, active: true, auth_id: authId, job_title: jobTitle }).eq("id", (existing as { id: string }).id);
  } else {
    const { error: insErr } = await svc.from("users").insert({ name, email, role, active: true, auth_id: authId, job_title: jobTitle });
    if (insErr) return { ok: false, error: insErr.message };
  }

  await logAudit({ actorId: me.id, actorName: me.name, action: "created", entity: "assignee", label: name, detail: `로그인 계정 생성 (${email})` });
  revalidatePath("/assignees");
  revalidatePath("/todos");
  return { ok: true };
}

// 직무(job_title)·권한(role) 변경(대표 전용). 직무는 체크리스트 역할 자동감지의 근거가 된다.
export async function updateStaffProfile(id: string, patch: { jobTitle?: string; role?: string }): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAppUser();
  if (me.role !== "owner") return { ok: false, error: "대표만 직무·권한을 변경할 수 있습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  const svc = createSupabaseServiceClient();
  const row: Record<string, unknown> = {};
  if (patch.jobTitle !== undefined) row.job_title = patch.jobTitle.trim() || null;
  if (patch.role !== undefined) {
    const role = patch.role === "owner" ? "owner" : patch.role === "guest" ? "guest" : "staff";
    if (id === me.id && role !== "owner") return { ok: false, error: "본인 권한은 변경할 수 없습니다(잠금 방지)." };
    row.role = role;
  }
  if (Object.keys(row).length === 0) return { ok: true };
  const { error } = await svc.from("users").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ actorId: me.id, actorName: me.name, action: "updated", entity: "assignee", label: id, detail: "직무/권한 변경" });
  revalidatePath("/assignees");
  revalidatePath("/hub");
  return { ok: true };
}

// 비밀번호 재설정/설정(대표 전용). 로그인 계정이 아직 없으면 만들어 연결.
export async function resetStaffPassword(userId: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAppUser();
  if (me.role !== "owner") return { ok: false, error: "대표만 비밀번호를 설정할 수 있습니다." };
  const password = newPassword || "";
  if (password.length < 6) return { ok: false, error: "비밀번호는 6자 이상이어야 합니다." };

  const svc = createSupabaseServiceClient();
  const { data: row } = await svc.from("users").select("auth_id, email, name").eq("id", userId).maybeSingle();
  const r = row as { auth_id: string | null; email: string | null; name: string | null } | null;
  if (!r) return { ok: false, error: "계정을 찾을 수 없습니다." };
  const email = (r.email ?? "").toLowerCase();
  if (!email || email.endsWith("@unho.local")) {
    return { ok: false, error: "이 담당자는 이름표라 로그인 계정이 아닙니다. '계정 만들기'로 이메일 계정을 생성하세요." };
  }

  let authId = r.auth_id ?? (await findAuthIdByEmail(svc, email));
  if (authId) {
    const { error } = await svc.auth.admin.updateUserById(authId, { password });
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: created, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return { ok: false, error: error.message };
    authId = created?.user?.id ?? null;
  }
  if (authId && r.auth_id !== authId) await svc.from("users").update({ auth_id: authId }).eq("id", userId);

  await logAudit({ actorId: me.id, actorName: me.name, action: "updated", entity: "assignee", label: r.name, detail: "비밀번호 설정" });
  revalidatePath("/assignees");
  return { ok: true };
}

export async function deleteAssignee(id: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAppUser();
  if (me.role !== "owner" && me.role !== "staff") return { ok: false, error: "권한이 없습니다." };
  // 안전장치: 본인 계정·대표(owner) 계정은 삭제 불가.
  if (id === me.id) return { ok: false, error: "본인 계정은 삭제할 수 없습니다." };
  const svc = createSupabaseServiceClient();
  const { data: target } = await svc.from("users").select("role").eq("id", id).maybeSingle();
  if ((target as { role?: string } | null)?.role === "owner") {
    return { ok: false, error: "대표 계정은 삭제할 수 없습니다." };
  }
  const { data: tgt } = await svc.from("users").select("name").eq("id", id).maybeSingle();
  const { error } = await svc.from("users").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ actorId: me.id, actorName: me.name, action: "deleted", entity: "assignee", label: (tgt as { name?: string } | null)?.name });
  revalidatePath("/assignees");
  revalidatePath("/todos");
  revalidatePath("/product-dev");
  return { ok: true };
}
