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

// assignee_user_ids 컬럼이 아직 없을 때(마이그레이션 전) 나는 오류인지 판별.
function isUndefinedColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || /(assignee_user_ids|file_url|file_name)/.test(err.message ?? "");
}

// FormData의 assignee_ids(체크박스 다중) → 중복 제거된 문자열 배열.
function readAssigneeIds(fd: FormData): string[] {
  const raw = fd.getAll("assignee_ids") as string[];
  return [...new Set(raw.map((s) => (s || "").trim()).filter(Boolean))];
}

export async function createTodo(fd: FormData): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };

  const title = (fd.get("title") as string)?.trim();
  if (!title) return { ok: false, error: "업무 내용을 입력하세요." };

  const str = (k: string) => {
    const v = (fd.get(k) as string)?.trim();
    return v ? v : null;
  };

  const ids = readAssigneeIds(fd);
  const base = {
    title,
    brand_id: str("brand_id"),
    priority: str("priority") ?? "보통",
    due_date: str("due_date"),
    status: str("status") ?? "예정",
    ref_link: str("ref_link"),
    note: str("note"),
    created_by: user.id,
    assignee_user_id: ids[0] ?? null,
  };
  const file = { file_url: str("file_url"), file_name: str("file_name") };

  const supabase = createSupabaseServerClient();
  // 컬럼 미적용 대비 단계 폴백: 전체 → 파일 제외 → 담당배열까지 제외
  let { error } = await supabase.from("todos").insert({ ...base, assignee_user_ids: ids, ...file });
  if (error && isUndefinedColumn(error)) {
    ({ error } = await supabase.from("todos").insert({ ...base, assignee_user_ids: ids }));
  }
  if (error && isUndefinedColumn(error)) {
    ({ error } = await supabase.from("todos").insert(base));
  }
  if (error) return { ok: false, error: error.message };

  revalidatePath("/todos");
  return { ok: true };
}

export async function updateTodo(id: string, fd: FormData): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };

  const title = (fd.get("title") as string)?.trim();
  if (!title) return { ok: false, error: "업무 내용을 입력하세요." };

  const str = (k: string) => {
    const v = (fd.get(k) as string)?.trim();
    return v ? v : null;
  };
  const status = str("status") ?? "예정";
  const ids = readAssigneeIds(fd);
  const base = {
    title,
    brand_id: str("brand_id"),
    priority: str("priority") ?? "보통",
    due_date: str("due_date"),
    status,
    completed_at: status === "완료" ? new Date().toISOString() : null,
    ref_link: str("ref_link"),
    note: str("note"),
    updated_at: new Date().toISOString(),
    assignee_user_id: ids[0] ?? null,
  };
  const file = { file_url: str("file_url"), file_name: str("file_name") };

  const supabase = createSupabaseServerClient();
  let { error } = await supabase
    .from("todos")
    .update({ ...base, assignee_user_ids: ids, ...file })
    .eq("id", id);
  if (error && isUndefinedColumn(error)) {
    ({ error } = await supabase.from("todos").update({ ...base, assignee_user_ids: ids }).eq("id", id));
  }
  if (error && isUndefinedColumn(error)) {
    ({ error } = await supabase.from("todos").update(base).eq("id", id));
  }
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  return { ok: true };
}

export async function setTodoStatus(id: string, status: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const done = status === "완료";
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("todos")
    .update({
      status,
      completed_at: done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  return { ok: true };
}

export async function deleteTodo(id: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "권한이 없습니다." };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  return { ok: true };
}

// ── 최운호 업무 → CEO 투두 이관 (대표 전용) ─────────────────────────────
// CEO 투두 보드는 브라우저 저장(localStorage)이라, 여기서는 DB의 최운호 담당 업무를
// 골라서 반환만 하고(클라이언트가 CEO 보드에 넣음), 별도 호출로 DB에서 지운다.
export type ChoiTodo = {
  id: string;
  title: string;
  note: string | null;
  brandName: string | null;
  status: string;
};

export async function getChoiTodos(): Promise<{ ok: boolean; items?: ChoiTodo[]; error?: string }> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 이관할 수 있습니다." };
  const supabase = createSupabaseServerClient();

  // "최운호" 담당 사용자 id 수집(이름 기준).
  const { data: choi } = await supabase.from("users").select("id, name").ilike("name", "%최운호%");
  const choiIds = new Set(((choi ?? []) as { id: string; name: string | null }[]).map((u) => u.id));
  if (choiIds.size === 0) return { ok: true, items: [] };

  // 담당자(단일/다중) 어느 쪽이든 최운호가 포함된 업무를 고른다.
  const sel = "id, title, note, status, assignee_user_id, assignee_user_ids, brands(name)";
  let rows: any[] = [];
  const res = await supabase.from("todos").select(sel).limit(1000);
  if (res.error) {
    // 다중 담당 컬럼이 아직 없으면 단일 컬럼만으로.
    const res2 = await supabase
      .from("todos")
      .select("id, title, note, status, assignee_user_id, brands(name)")
      .limit(1000);
    rows = (res2.data ?? []) as any[];
  } else {
    rows = (res.data ?? []) as any[];
  }

  const items: ChoiTodo[] = rows
    .filter((r) => {
      if (r.assignee_user_id && choiIds.has(r.assignee_user_id)) return true;
      const arr = (r.assignee_user_ids ?? []) as string[];
      return arr.some((id) => choiIds.has(id));
    })
    .map((r) => ({
      id: r.id,
      title: r.title,
      note: r.note ?? null,
      brandName: r.brands?.name ?? null,
      status: r.status,
    }));

  return { ok: true, items };
}

export async function deleteTodos(ids: string[]): Promise<Result> {
  const user = await requireAppUser();
  if (user.role !== "owner") return { ok: false, error: "대표만 삭제할 수 있습니다." };
  const clean = [...new Set((ids || []).filter(Boolean))];
  if (clean.length === 0) return { ok: true };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("todos").delete().in("id", clean);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  return { ok: true };
}
